import { _electron as electron, ElectronApplication } from 'playwright';
import path from 'path';
import fs from 'fs';

export interface LaunchOptions {
  env?: Record<string, string>;
  cwd?: string;
  disableQuitDialog?: boolean;
}

/**
 * Launch Electron app for testing with proper defaults
 * Ensures quit dialog is disabled by default to prevent test blocking
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

  return await electron.launch({
    args: [mainPath],
    env,
    cwd: options.cwd
  });
}

/**
 * Close Electron app quickly using process.exit to prevent worker teardown timeout
 * We use process.exit(0) because electronApp.close() can be too slow (>5 seconds)
 * and cause worker teardown timeouts. The trade-off is acceptable since these are
 * ephemeral test instances.
 *
 * IMPORTANT: We must cleanup fork processes before calling process.exit(), because
 * process.exit() bypasses Electron's before-quit event where cleanup normally happens.
 */
export async function closeElectronApp(electronApp: ElectronApplication | null): Promise<void> {
  if (!electronApp) {
    return;
  }

  try {
    // Cleanup fork processes before exiting with a timeout to prevent hanging
    // This is critical because process.exit(0) bypasses the before-quit event
    const cleanupPromise = electronApp.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { shellProcessManager } = require('./shell-manager');
      await shellProcessManager.cleanup();
      process.exit(0);
    });

    // Add a timeout to prevent cleanup from hanging the test suite
    // If cleanup takes more than 5 seconds, we force exit anyway
    await Promise.race([
      cleanupPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Cleanup timeout')), 5000)
      )
    ]);
  } catch (error) {
    // Ignore errors - process.exit(0) will close the connection immediately
    // which causes Playwright to throw, but that's expected and OK
    // Also, cleanup timeout errors are expected if processes don't exit cleanly
    try {
      // If cleanup timed out or failed, force close the app
      await electronApp.close();
    } catch {
      // Ignore close errors - app may already be closed
    }
  }
}