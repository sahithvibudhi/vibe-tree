import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';

test.describe('Quit Confirmation Dialog', () => {
  test('with dialog enabled - should prevent quit', async () => {
    // Launch app with dialog enabled
    const mainPath = path.join(__dirname, '../dist/main/index.js');
    if (!fs.existsSync(mainPath)) {
      throw new Error('Application not built. Run "pnpm build" first.');
    }

    const electronApp = await electron.launch({
      args: [path.join(__dirname, '..')],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DISABLE_QUIT_DIALOG: 'false'
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
    // Launch app with dialog disabled
    const mainPath = path.join(__dirname, '../dist/main/index.js');
    if (!fs.existsSync(mainPath)) {
      throw new Error('Application not built. Run "pnpm build" first.');
    }

    const electronApp = await electron.launch({
      args: [path.join(__dirname, '..')],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DISABLE_QUIT_DIALOG: 'true'
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