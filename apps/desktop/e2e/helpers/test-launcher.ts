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
 *
 * We use process.exit(0) because electronApp.close() hangs for this app - the app's
 * cleanup process takes too long (>2 minutes), causing test timeouts. This is NOT
 * a Playwright issue (the 30s timeout was removed in v1.19), but rather specific
 * to this app's shutdown behavior.
 *
 * The trade-off: Playwright's exit code becomes unreliable because process.exit(0)
 * causes connection loss that Playwright interprets as an error. The CI workflow
 * handles this by parsing test output instead of relying on exit codes.
 *
 * IMPORTANT: We must cleanup fork processes before calling process.exit(), because
 * process.exit() bypasses Electron's before-quit event where cleanup normally happens.
 */
export async function closeElectronApp(electronApp: ElectronApplication | null): Promise<void> {
  if (!electronApp) {
    return;
  }

  try {
    // Cleanup fork processes before exiting
    // This is critical because process.exit(0) bypasses the before-quit event
    await electronApp.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { shellProcessManager } = require('./shell-manager');
      await shellProcessManager.cleanup();
      process.exit(0);
    });
  } catch (error) {
    // Ignore errors - process.exit(0) will close the connection immediately
    // which causes Playwright to throw, but that's expected and OK
  }
}