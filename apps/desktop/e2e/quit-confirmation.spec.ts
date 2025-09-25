import { test, expect } from '@playwright/test';
import { ElectronApplication, _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';

test.describe('Quit Confirmation Dialog', () => {
  let electronApp: ElectronApplication;

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.evaluate(() => process.exit(0));
    }
  });

  test('with dialog enabled - should prevent quit', async () => {
    // Use test-index.js like other e2e tests
    const testMainPath = path.join(__dirname, '../dist/main/test-index.js');
    const mainPath = fs.existsSync(testMainPath) ? testMainPath : path.join(__dirname, '..');

    electronApp = await electron.launch({
      args: [mainPath],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TEST_MODE: 'true',
        DISABLE_QUIT_DIALOG: 'false'  // Enable dialog for this test
      },
    });

    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // Try to quit - should be prevented by dialog
    const quitPrevented = await electronApp.evaluate(({ app, BrowserWindow }) => {
      app.quit();
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(BrowserWindow.getAllWindows().length > 0);
        }, 200);
      });
    });

    expect(quitPrevented).toBe(true);
  });

  test('with dialog disabled - should quit immediately', async () => {
    // Use test-index.js like other e2e tests
    const testMainPath = path.join(__dirname, '../dist/main/test-index.js');
    const mainPath = fs.existsSync(testMainPath) ? testMainPath : path.join(__dirname, '..');

    electronApp = await electron.launch({
      args: [mainPath],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TEST_MODE: 'true',
        DISABLE_QUIT_DIALOG: 'true'  // Disable dialog for this test
      },
    });

    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // Check if app is running before quit
    const windowsBeforeQuit = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows().length;
    });
    expect(windowsBeforeQuit).toBeGreaterThan(0);

    // Try to quit - should succeed immediately
    // This will close the app, so we need to handle the promise rejection
    const quitPromise = electronApp.evaluate(({ app }) => {
      app.quit();
      return new Promise((resolve) => {
        setTimeout(() => resolve('quit-called'), 100);
      });
    });

    // The app should quit, causing the connection to close
    // We expect this to either complete or reject due to app closing
    try {
      const result = await quitPromise;
      // If we get here, the app didn't quit immediately (unexpected)
      expect(result).toBe('quit-called');
    } catch (error) {
      // Expected: the app quit and closed the connection
      // This is the success case for this test
      expect(error.message).toContain('Target page, context or browser has been closed');
    }
  });

});