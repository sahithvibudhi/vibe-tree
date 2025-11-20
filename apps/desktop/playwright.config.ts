import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Use only 1 worker for Electron tests
  reporter: 'html',
  // Increased timeout to 120s (2 minutes) to allow more time for worker teardown
  // The worker teardown timeout uses the same value as the test timeout
  // This helps prevent "Worker teardown timeout of 60000ms exceeded" errors
  timeout: 120000,
  // Set globalTimeout to prevent overall test suite timeout issues
  // Increased from 15 minutes to 20 minutes to handle fork architecture cleanup delays
  globalTimeout: process.env.CI ? 1200000 : 0, // 20 minutes in CI, unlimited locally
  // Set a shorter worker teardown timeout to fail fast instead of hanging
  // This prevents the 2-minute wait when workers don't teardown cleanly
  // 30 seconds should be plenty for normal cleanup, and we have pkill as backup in CI
  workerTeardownTimeout: 30000,
  // Increase expect timeout for slow operations
  expect: {
    timeout: 10000,
  },
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'electron',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});