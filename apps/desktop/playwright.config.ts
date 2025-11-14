import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Use only 1 worker for Electron tests
  reporter: 'html',
  timeout: 60000,
  // Set globalTimeout to prevent worker teardown timeout issues
  // Increased from 10 minutes to 15 minutes to handle PTY cleanup delays
  globalTimeout: process.env.CI ? 900000 : 0, // 15 minutes in CI, unlimited locally
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