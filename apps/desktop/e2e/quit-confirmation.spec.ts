import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { closeElectronApp } from './helpers/test-launcher';
import path from 'path';
import fs from 'fs';

test.describe('Quit Confirmation Dialog', () => {
  // Skip this test - it causes worker teardown timeout issues because it calls app.quit()
  // but expects the app to stay alive, leaving Electron in an inconsistent state.
  // The closeElectronApp() helper can't clean up properly in this state.
  test.skip('with dialog enabled - should prevent quit when user cancels', async () => {
    test.setTimeout(30000);

    // Use test-index.js like other e2e tests
    const testMainPath = path.join(__dirname, '../dist/main/test-index.js');
    const mainPath = fs.existsSync(testMainPath) ? testMainPath : path.join(__dirname, '..');

    const electronApp = await electron.launch({
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

    // Mock the dialog to return cancel (index 0)
    await electronApp.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 0; // Return 0 for Cancel button
    });

    // Try to quit - should be prevented by dialog returning cancel
    const quitPrevented = await electronApp.evaluate(({ app, BrowserWindow }) => {
      app.quit();
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(BrowserWindow.getAllWindows().length > 0);
        }, 200);
      });
    });

    expect(quitPrevented).toBe(true);

    // Force cleanup by killing the process
    await closeElectronApp(electronApp);
  });

  test.skip('with dialog enabled - should quit when user confirms', async () => {
    test.setTimeout(30000);

    // Use test-index.js like other e2e tests
    const testMainPath = path.join(__dirname, '../dist/main/test-index.js');
    const mainPath = fs.existsSync(testMainPath) ? testMainPath : path.join(__dirname, '..');

    const electronApp = await electron.launch({
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

    // Mock the dialog to return OK (index 1)
    await electronApp.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1; // Return 1 for OK button
    });

    // Trigger quit which should show dialog and then quit
    await electronApp.evaluate(({ app }) => {
      app.quit();
    });

    // Wait for app to quit by polling windows count with timeout
    let appQuit = false;
    const maxAttempts = 20;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      try {
        const windowCount = await electronApp.evaluate(({ BrowserWindow }) => {
          return BrowserWindow.getAllWindows().length;
        });
        if (windowCount === 0) {
          appQuit = true;
          break;
        }
      } catch {
        // Connection error means app quit
        appQuit = true;
        break;
      }
    }

    expect(appQuit).toBe(true);

    // Ensure cleanup
    try {
      await closeElectronApp(electronApp);
    } catch {
      // App already closed, ignore
    }
  });

  test.skip('with dialog disabled - should quit immediately', async () => {
    test.setTimeout(30000); // Shorter timeout for this specific test

    // Use test-index.js like other e2e tests
    const testMainPath = path.join(__dirname, '../dist/main/test-index.js');
    const mainPath = fs.existsSync(testMainPath) ? testMainPath : path.join(__dirname, '..');

    const electronApp = await electron.launch({
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
    await electronApp.evaluate(({ app }) => {
      app.quit();
    });

    // Wait for app to quit by polling windows count with timeout
    let appQuit = false;
    const maxAttempts = 20;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      try {
        const windowCount = await electronApp.evaluate(({ BrowserWindow }) => {
          return BrowserWindow.getAllWindows().length;
        });
        if (windowCount === 0) {
          appQuit = true;
          break;
        }
      } catch {
        // Connection error means app quit
        appQuit = true;
        break;
      }
    }

    expect(appQuit).toBe(true);

    // Ensure cleanup
    try {
      await closeElectronApp(electronApp);
    } catch {
      // App already closed, ignore
    }
  });

});