import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';

test.describe('Quit Confirmation Dialog', () => {
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeEach(async () => {
    // Use the actual built application, not test-index
    const mainPath = path.join(__dirname, '../dist/main/index.js');

    // Ensure the app is built before running tests
    if (!fs.existsSync(mainPath)) {
      throw new Error('Application not built. Run "pnpm build" first.');
    }

    electronApp = await electron.launch({
      args: [path.join(__dirname, '..')], // Launch the desktop app directory
      env: {
        ...process.env,
        NODE_ENV: 'production', // Test production behavior
      },
    });

    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    if (electronApp) {
      // Force quit without dialog for cleanup
      await electronApp.evaluate(({ app }) => {
        // Force exit to bypass quit confirmation for test cleanup
        process.exit(0);
      });
    }
  });

  test('should prevent app from quitting when close is attempted', async () => {
    // Try to close the window - this should trigger the quit confirmation
    const closeAttempted = await electronApp.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length === 0) return { windowExists: false };

      const window = windows[0];

      // Try to close the window
      window.close();

      // Return whether window is still open after a brief delay
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            windowExists: true,
            stillOpen: !window.isDestroyed() && BrowserWindow.getAllWindows().length > 0
          });
        }, 200);
      });
    });

    // The window should still be open because the quit confirmation dialog prevents closing
    expect(closeAttempted.windowExists).toBe(true);
    expect(closeAttempted.stillOpen).toBe(true);
  });

  test('should have quit menu item that triggers confirmation', async () => {
    // Verify the quit menu item exists
    const menuInfo = await electronApp.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      if (!menu) return { hasMenu: false, hasQuitItem: false };

      // Find the quit menu item
      const findQuitItem = (items: Electron.MenuItem[]): boolean => {
        for (const item of items) {
          if (item.role === 'quit') return true;
          if (item.submenu) {
            if (findQuitItem(item.submenu.items)) return true;
          }
        }
        return false;
      };

      return {
        hasMenu: true,
        hasQuitItem: findQuitItem(menu.items)
      };
    });

    expect(menuInfo.hasMenu).toBe(true);
    expect(menuInfo.hasQuitItem).toBe(true);
  });

  test('should prevent app.quit() from immediately closing the app', async () => {
    // Try to quit the app programmatically
    const quitAttempted = await electronApp.evaluate(({ app, BrowserWindow }) => {
      const initialWindows = BrowserWindow.getAllWindows().length;

      // Attempt to quit
      app.quit();

      // Check if the app is still running after a delay
      return new Promise((resolve) => {
        setTimeout(() => {
          const currentWindows = BrowserWindow.getAllWindows().length;
          resolve({
            initialWindows,
            currentWindows,
            appStillRunning: currentWindows > 0
          });
        }, 200);
      });
    });

    // The app should still be running because quit was prevented by the confirmation dialog
    expect(quitAttempted.initialWindows).toBeGreaterThan(0);
    expect(quitAttempted.appStillRunning).toBe(true);
  });
});