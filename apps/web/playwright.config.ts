import { defineConfig } from '@playwright/test';
import * as os from 'os';
import * as path from 'path';

// The fixture repo path is shared with global-setup.ts and the server env
export const FIXTURE_REPO = path.join(os.tmpdir(), 'vibetree-web-e2e-fixture');

const SERVER_PORT = 3102;
const WEB_PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    // Use a preinstalled Chromium when the environment provides one
    // (e.g. containers with PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD)
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {}
  },
  webServer: [
    {
      command: 'node ../server/dist/index.js',
      url: `http://127.0.0.1:${SERVER_PORT}/health`,
      reuseExistingServer: false,
      env: {
        PORT: String(SERVER_PORT),
        HOST: '127.0.0.1',
        DEFAULT_PROJECTS: FIXTURE_REPO,
        PROJECT_PATH: FIXTURE_REPO
      }
    },
    {
      // Test the real PWA build (manifest + service worker), not the dev server
      command: `pnpm exec vite build --outDir dist-e2e && pnpm exec vite preview --outDir dist-e2e --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 180000,
      env: {
        VITE_WS_URL: `ws://localhost:${SERVER_PORT}`
      }
    }
  ]
});
