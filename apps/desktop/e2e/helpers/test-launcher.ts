import { _electron as electron, ElectronApplication } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

export interface LaunchOptions {
  env?: Record<string, string>;
  cwd?: string;
  disableQuitDialog?: boolean;
  maxRetries?: number;
}

/**
 * Kill any stale Electron processes that may have been left behind by previous tests
 * This prevents singleton lock issues and resource exhaustion
 */
function killStaleElectronProcesses(): void {
  if (process.platform === 'darwin' || process.platform === 'linux') {
    try {
      // Kill any Electron processes that match our test pattern
      // Use -9 for immediate termination, ignore errors if no processes found
      execSync('pkill -9 -f "dist/main/test-index.js" 2>/dev/null || true', { stdio: 'ignore' });
    } catch (error) {
      // Ignore - no matching processes or pkill not available
    }
  }
}

/**
 * Launch Electron app for testing with proper defaults
 * Ensures quit dialog is disabled by default to prevent test blocking
 * Includes retry logic to handle Electron singleton lock issues
 */
export async function launchElectronApp(options: LaunchOptions = {}): Promise<ElectronApplication> {
  const testMainPath = path.join(__dirname, '../../dist/main/test-index.js');
  const mainPath = fs.existsSync(testMainPath) ? testMainPath : path.join(__dirname, '../..');

  const env = {
    ...process.env,
    NODE_ENV: 'test',
    TEST_MODE: 'true',
    // Disable quit dialog by default to prevent test blocking
    DISABLE_QUIT_DIALOG: options.disableQuitDialog === false ? 'false' : 'true',
    ...options.env
  };

  const maxRetries = options.maxRetries ?? 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Kill any stale Electron processes before retry attempts
    if (attempt > 1) {
      killStaleElectronProcesses();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    try {
      return await electron.launch({
        args: [mainPath],
        env,
        cwd: options.cwd,
        timeout: 30000
      });
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      // Wait before retry to allow previous Electron instance to release lock
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw new Error('Failed to launch Electron app after retries');
}

/**
 * Wait for first window with retry logic to handle Electron singleton lock issues
 * Retries launch if firstWindow times out, to account for lock release delays
 */
export async function launchElectronAppWithWindow(options: LaunchOptions = {}): Promise<{ electronApp: ElectronApplication; page: import('playwright').Page }> {
  const testMainPath = path.join(__dirname, '../../dist/main/test-index.js');
  const mainPath = fs.existsSync(testMainPath) ? testMainPath : path.join(__dirname, '../..');

  const env = {
    ...process.env,
    NODE_ENV: 'test',
    TEST_MODE: 'true',
    DISABLE_QUIT_DIALOG: options.disableQuitDialog === false ? 'false' : 'true',
    ...options.env
  };

  const maxRetries = options.maxRetries ?? 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Kill any stale Electron processes before attempting launch
    // This prevents singleton lock issues from previous failed tests
    if (attempt > 1) {
      killStaleElectronProcesses();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    let electronApp: ElectronApplication | null = null;
    try {
      electronApp = await electron.launch({
        args: [mainPath],
        env,
        cwd: options.cwd,
        timeout: 30000
      });

      // Wait for first window with shorter timeout so we can retry
      const page = await electronApp.firstWindow({ timeout: 15000 });
      return { electronApp, page };
    } catch (error) {
      // Clean up failed attempt
      if (electronApp) {
        try {
          await electronApp.evaluate(() => process.exit(0));
        } catch {
          // Ignore - process may already be dead
        }
        try {
          await electronApp.close();
        } catch {
          // Ignore - app may already be closed
        }
      }

      if (attempt === maxRetries) {
        throw error;
      }
      // Wait before retry to allow previous Electron instance to release lock
      await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
    }
  }

  throw new Error('Failed to launch Electron app with window after retries');
}

/**
 * Close Electron app quickly using process.exit to prevent worker teardown timeout
 * We use process.exit(0) because electronApp.close() can be too slow (>5 seconds)
 * and cause worker teardown timeouts. The trade-off is acceptable since these are
 * ephemeral test instances.
 */
export async function closeElectronApp(electronApp: ElectronApplication | null): Promise<void> {
  if (!electronApp) {
    return;
  }

  try {
    await electronApp.evaluate(() => process.exit(0));
  } catch (error) {
    // Ignore errors - process.exit(0) will close the connection immediately
    // which causes Playwright to throw, but that's expected and OK
  }

  // Also call close() to clean up Playwright's connection properly
  // This ensures no stale connections remain that could interfere with subsequent tests
  try {
    await electronApp.close();
  } catch (error) {
    // Ignore - app is already closed
  }

  // Wait for Electron singleton lock file to be released
  // This prevents the next test's beforeEach from failing to acquire the lock
  // NOTE: We intentionally do NOT call killStaleElectronProcesses() here because
  // it can kill processes that are still in use. The retry logic in launchElectronAppWithWindow()
  // will handle any stale processes if launch fails.
  // Increased wait time to 3000ms to give more time for PTY cleanup and lock release
  await new Promise(resolve => setTimeout(resolve, 3000));
}