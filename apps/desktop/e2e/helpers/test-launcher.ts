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
 * Close Electron app with proper PTY cleanup to prevent worker teardown timeout
 * First terminates all PTY processes via IPC handler, then exits.
 * This prevents orphaned PTY processes from blocking the app shutdown.
 */
export async function closeElectronApp(electronApp: ElectronApplication | null): Promise<void> {
  if (!electronApp) {
    return;
  }

  try {
    // Directly call cleanup in the main process context
    // The shellProcessManager is imported in test-index.ts and accessible globally
    await electronApp.evaluate(async () => {
      // Access the shell manager from the module cache
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const shellManagerModule = require('./shell-manager');
      const shellProcessManager = shellManagerModule.shellProcessManager;

      if (shellProcessManager && typeof shellProcessManager.cleanup === 'function') {
        console.log('[test] Cleaning up PTY processes before exit...');
        await shellProcessManager.cleanup();
        console.log('[test] PTY cleanup complete');
      }

      // Exit after cleanup
      process.exit(0);
    });
  } catch (error) {
    // Ignore errors - process.exit(0) will close the connection immediately
    // which causes Playwright to throw, but that's expected and OK
  }
}