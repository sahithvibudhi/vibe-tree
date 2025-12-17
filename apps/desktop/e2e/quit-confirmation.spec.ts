import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { closeElectronApp } from './helpers/test-launcher';
import path from 'path';
import fs from 'fs';

test.describe('Quit Confirmation Dialog', () => {
  test('with dialog disabled - should quit immediately without showing dialog', async () => {
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
        DISABLE_QUIT_DIALOG: 'true'  // Disable dialog (default for tests)
      },
    });

    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // Check if app is running before quit
    const windowsBeforeQuit = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows().length;
    });
    expect(windowsBeforeQuit).toBeGreaterThan(0);

    // Quit the app - should succeed immediately without showing dialog
    try {
      await electronApp.evaluate(({ app }) => {
        app.quit();
      });
    } catch {
      // evaluate might throw if app closes quickly - that's fine
    }

    // Wait for app to close
    try {
      await electronApp.close();
    } catch {
      // Already closed - that's fine
    }

    // If we get here without hanging, the test passed
    // The app quit cleanly without showing a dialog
  });

  test('closeElectronApp helper should close app cleanly', async () => {
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
        DISABLE_QUIT_DIALOG: 'true'
      },
    });

    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // Verify app is running
    const windowCount = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows().length;
    });
    expect(windowCount).toBeGreaterThan(0);

    // Use the helper to close - should work cleanly
    await closeElectronApp(electronApp);

    // If we get here without hanging, the test passed
  });
});
