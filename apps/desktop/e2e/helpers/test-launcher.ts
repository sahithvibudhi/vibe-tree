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
 * Close Electron app properly to prevent worker teardown timeout
 *
 * Previously used process.exit(0) for fast cleanup, but this left resources
 * in an inconsistent state causing worker teardown timeouts in CI.
 *
 * Now uses proper cleanup sequence:
 * 1. Destroy all windows explicitly
 * 2. Close app normally
 * 3. Fallback to process.exit only if normal close fails
 */
export async function closeElectronApp(electronApp: ElectronApplication | null): Promise<void> {
  if (!electronApp) {
    return;
  }

  try {
    // First, close all windows to trigger proper cleanup
    await electronApp.evaluate(async ({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(win => {
        try {
          win.destroy();
        } catch (e) {
          // Window may already be closed
        }
      });
    });

    // Small delay to allow window cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Then close the app properly
    await electronApp.close();
  } catch (error) {
    // If proper close fails, fallback to process.exit
    try {
      await electronApp.evaluate(() => process.exit(0));
    } catch {
      // Ignore - process may already be gone
    }
  }
}