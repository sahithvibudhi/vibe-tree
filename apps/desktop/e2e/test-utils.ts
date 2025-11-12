import { Page } from '@playwright/test';

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
