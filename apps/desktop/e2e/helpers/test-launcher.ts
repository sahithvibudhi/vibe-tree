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
 * Properly close Electron app to prevent worker teardown timeout
 * This uses electronApp.close() which is the recommended way to close Electron apps in Playwright
 * Using process.exit() can cause worker teardown timeouts as it doesn't allow Playwright to clean up properly
 */
export async function closeElectronApp(electronApp: ElectronApplication | null): Promise<void> {
  if (!electronApp) {
    return;
  }

  try {
    // Close with a timeout to prevent hanging
    const closePromise = electronApp.close();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Close timeout')), 5000)
    );

    await Promise.race([closePromise, timeoutPromise]);
  } catch (error) {
    // If close hangs or fails, force kill the process
    console.warn('Error closing Electron app, force killing:', error);
    try {
      await electronApp.evaluate(() => {
        // Force kill all windows first
        const { BrowserWindow } = require('electron');
        BrowserWindow.getAllWindows().forEach(w => w.destroy());
        // Then exit
        process.exit(0);
      });
    } catch (forceKillError) {
      // Ignore - app is likely already dead
      console.warn('Force kill also failed (app likely already closed):', forceKillError);
    }
  }
}