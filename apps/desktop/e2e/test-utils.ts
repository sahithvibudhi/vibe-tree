import { Page, ElectronApplication } from '@playwright/test';

/**
 * Polls a condition function until it returns true or timeout is reached
 *
 * @param page - Playwright page instance for waiting
 * @param options - Configuration options
 * @param options.condition - Function that returns true when condition is met
 * @param options.timeoutMs - Maximum time to wait in milliseconds (default: 10000)
 * @param options.intervalMs - Polling interval in milliseconds (default: 200)
 * @param options.message - Error message if timeout is reached
 * @returns Promise that resolves when condition is met
 * @throws Error if timeout is reached before condition is met
 */
export async function waitUntil(
  page: Page,
  options: {
    condition: () => Promise<boolean> | boolean;
    timeoutMs?: number;
    intervalMs?: number;
    message?: string;
  }
): Promise<void> {
  const {
    condition,
    timeoutMs = 10000,
    intervalMs = 200,
    message = 'Timeout waiting for condition'
  } = options;

  const startTime = Date.now();
  const maxAttempts = Math.ceil(timeoutMs / intervalMs);
  let attempts = 0;

  while (attempts < maxAttempts) {
    const result = await condition();

    if (result) {
      return;
    }

    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutMs) {
      throw new Error(`${message} (timeout after ${elapsed}ms)`);
    }

    await page.waitForTimeout(intervalMs);
    attempts++;
  }

  throw new Error(`${message} (max attempts: ${maxAttempts})`);
}

/**
 * Waits for the Electron application menu to be updated with a specific condition
 *
 * @param page - Playwright page instance for waiting
 * @param electronApp - Electron application instance
 * @param options - Configuration options
 * @param options.condition - Function that checks the menu state and returns true when updated
 * @param options.timeoutMs - Maximum time to wait in milliseconds (default: 5000)
 * @param options.intervalMs - Polling interval in milliseconds (default: 100)
 * @param options.message - Error message if timeout is reached
 * @returns Promise that resolves when menu is updated
 * @throws Error if timeout is reached before menu is updated
 */
export async function waitForMenuUpdate(
  page: Page,
  electronApp: ElectronApplication,
  options: {
    condition: (menu: Electron.Menu) => boolean;
    timeoutMs?: number;
    intervalMs?: number;
    message?: string;
  }
): Promise<void> {
  const {
    condition,
    timeoutMs = 5000,
    intervalMs = 100,
    message = 'Timeout waiting for menu update'
  } = options;

  await waitUntil(page, {
    condition: async () => {
      const menu = await electronApp.evaluate(({ Menu }) => {
        return Menu.getApplicationMenu();
      });

      if (!menu) {
        return false;
      }

      return condition(menu);
    },
    timeoutMs,
    intervalMs,
    message
  });
}
