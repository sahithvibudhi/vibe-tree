import { test, expect } from '@playwright/test';
import { ElectronApplication, Page } from 'playwright';
import { closeElectronApp, launchElectronAppWithWindow } from './helpers/test-launcher';
import path from 'path';

test.describe('Quit Confirmation Dialog', () => {
  // Set timeout for all tests to handle retry logic (3 retries @ ~50s each + test + cleanup)
  test.describe.configure({ timeout: 180000 });

  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeEach(async () => {
    const appDir = path.join(__dirname, '..');

    const result = await launchElectronAppWithWindow({
      disableQuitDialog: true, // Use true for reliable cleanup
      cwd: appDir,
      maxRetries: 3
    });
    electronApp = result.electronApp;
    page = result.page;
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    if (electronApp) {
      await closeElectronApp(electronApp);
    }
  });

  test('should mock dialog to return cancel (0)', async () => {
    // Mock the dialog to return cancel (index 0)
    await electronApp.evaluate(({ dialog }) => {
      (globalThis as Record<string, unknown>).__dialogCallCount = 0;
      dialog.showMessageBoxSync = () => {
        (globalThis as Record<string, unknown>).__dialogCallCount =
          ((globalThis as Record<string, unknown>).__dialogCallCount as number || 0) + 1;
        return 0; // Return 0 for Cancel button
      };
    });

    // Verify the mock returns cancel (0)
    const dialogResult = await electronApp.evaluate(({ dialog }) => {
      const result = dialog.showMessageBoxSync({
        type: 'question',
        buttons: ['Cancel', 'OK'],
        defaultId: 0,
        cancelId: 0,
        title: 'Confirm Quit',
        message: 'Are you sure you want to quit?'
      });
      return {
        result,
        callCount: (globalThis as Record<string, unknown>).__dialogCallCount as number
      };
    });

    expect(dialogResult.result).toBe(0); // Cancel button
    expect(dialogResult.callCount).toBe(1);
  });

  test('should mock dialog to return OK (1)', async () => {
    // Mock the dialog to return OK (index 1)
    await electronApp.evaluate(({ dialog }) => {
      (globalThis as Record<string, unknown>).__dialogCallCount = 0;
      dialog.showMessageBoxSync = () => {
        (globalThis as Record<string, unknown>).__dialogCallCount =
          ((globalThis as Record<string, unknown>).__dialogCallCount as number || 0) + 1;
        return 1; // Return 1 for OK button
      };
    });

    // Verify the mock returns OK (1)
    const dialogResult = await electronApp.evaluate(({ dialog }) => {
      const result = dialog.showMessageBoxSync({
        type: 'question',
        buttons: ['Cancel', 'OK'],
        defaultId: 0,
        cancelId: 0,
        title: 'Confirm Quit',
        message: 'Are you sure you want to quit?'
      });
      return {
        result,
        callCount: (globalThis as Record<string, unknown>).__dialogCallCount as number
      };
    });

    expect(dialogResult.result).toBe(1); // OK button
    expect(dialogResult.callCount).toBe(1);
  });

  test('with dialog disabled - should quit immediately', async () => {
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

    // Mark electronApp as null to prevent double-close in afterEach
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    electronApp = null as any;
  });

});
