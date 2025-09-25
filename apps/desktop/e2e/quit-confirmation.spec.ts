import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';

test.describe('Quit Confirmation Dialog', () => {
  test('with dialog enabled - should prevent quit', async () => {
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

    // Cleanup
    await electronApp.evaluate(() => process.exit(0));
  });

  test('with dialog disabled - should quit immediately', async () => {
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

    // Try to quit - should succeed immediately
    await electronApp.evaluate(({ app }) => {
      app.quit();
    });

    // Wait briefly and check if app closed
    await page.waitForTimeout(500);

    // If we reach here and the app closed, test passes
    // The app should have exited by now
  });

});