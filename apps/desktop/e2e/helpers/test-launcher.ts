import { _electron as electron, ElectronApplication } from 'playwright';
import path from 'path';
import fs from 'fs';

export interface LaunchOptions {
  env?: Record<string, string>;
  cwd?: string;
  disableQuitDialog?: boolean;
}

/**
 * Launch Electron app for testing with proper defaults
 * Ensures quit dialog is disabled by default to prevent test blocking
 */
export async function launchElectronApp(options: LaunchOptions = {}): Promise<ElectronApplication> {
  const testMainPath = path.join(__dirname, '../../dist/main/test-index.js');
  const mainPath = fs.existsSync(testMainPath) ? testMainPath : path.join(__dirname, '../..');

  const env = {
    ...process.env,
    NODE_ENV: 'test',
    TEST_MODE: 'true',
    // Disable quit dialog by default to prevent test blocking
    DISABLE_QUIT_DIALOG: options.disableQuitDialog === false ? 'false' : 'true',
    ...options.env
  };

  return await electron.launch({
    args: [mainPath],
    env,
    cwd: options.cwd
  });
}

/**
 * Close Electron app gracefully using electronApp.close()
 *
 * Previously used process.exit(0) as a workaround for slow close(), but the
 * 30s timeout on electronApp.close() was removed in Playwright v1.19
 * (see https://github.com/microsoft/playwright/issues/11068).
 *
 * Using close() properly allows Playwright to report correct exit codes
 * without needing to parse output in CI.
 */
export async function closeElectronApp(electronApp: ElectronApplication | null): Promise<void> {
  if (!electronApp) {
    return;
  }

  try {
    // Cleanup fork processes before closing to speed up shutdown
    await electronApp.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { shellProcessManager } = require('./shell-manager');
      await shellProcessManager.cleanup();
    });
  } catch (error) {
    // Ignore cleanup errors - app may already be closing
  }

  // Use proper close() - no longer has timeout issue since Playwright v1.19
  await electronApp.close();
}