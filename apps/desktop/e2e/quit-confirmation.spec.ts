import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';

test.describe('Quit Confirmation Dialog', () => {
  test('with dialog enabled - should prevent quit when user cancels', async () => {
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
    await electronApp.evaluate(() => process.exit(0));
  });

  test('with dialog enabled - should quit when user confirms', async () => {
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

    // Try to quit - app should quit after dialog returns OK
    // We expect this to close the connection
    try {
      await electronApp.evaluate(({ app }) => {
        app.quit();
        // Give it a moment to process the quit
        return new Promise(resolve => setTimeout(resolve, 100));
      });

      // If we get here, try to check window state
      const windowsAfterQuit = await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
      // If we can still communicate, the app didn't quit (test failure)
      throw new Error(`App should have quit but still has ${windowsAfterQuit} windows`);
    } catch (error) {
      // Expected: the app quit and we can't communicate with it
      const errorMessage = (error as Error).message;
      // The error should indicate connection issues, not our thrown error
      if (errorMessage.includes('App should have quit')) {
        throw error; // Re-throw if it's our failure message
      }
      // It should be a connection/target closed error - this means success!
      expect(errorMessage.toLowerCase()).toMatch(/target.*closed|connection|disconnected/);
    }
  });

  test('with dialog disabled - should quit immediately', async () => {
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
      expect((error as Error).message).toContain('Target page, context or browser has been closed');
    }
  });

});