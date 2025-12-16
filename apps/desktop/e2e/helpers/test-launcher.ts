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
 * Close Electron app properly by triggering app.quit() and waiting for clean shutdown
 *
 * With DISABLE_QUIT_DIALOG=true (set by default in tests), the app will:
 * 1. Skip all quit confirmation dialogs
 * 2. Run shellProcessManager.cleanup() in before-quit handler
 * 3. Exit cleanly
 */
export async function closeElectronApp(electronApp: ElectronApplication | null): Promise<void> {
  if (!electronApp) {
    return;
  }

  try {
    // Trigger app.quit() - with DISABLE_QUIT_DIALOG=true, this will quit cleanly
    await electronApp.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('electron');
      app.quit();
    });
  } catch {
    // evaluate might throw if app already closed - that's fine
  }

  try {
    // Wait for the app to close
    await electronApp.close();
  } catch {
    // Already closed - that's fine
  }
}