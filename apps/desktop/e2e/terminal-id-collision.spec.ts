import { test, expect } from '@playwright/test';
import { ElectronApplication, Page } from 'playwright';
import { closeElectronApp, launchElectronAppWithWindow } from './helpers/test-launcher';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';

/**
 * Test to verify that rapid terminal splits don't cause PTY leaks due to ID collisions
 *
 * Before fix: Using Date.now() for terminal IDs caused collisions when splitting rapidly,
 * leading to PTY file descriptor leaks.
 *
 * After fix: Using a monotonic counter ensures unique IDs, preventing leaks.
 */

/**
 * Helper function to create a dummy git repository for testing
 */
function createDummyRepo(): string {
  const timestamp = Date.now();
  const dummyRepoPath = path.join(os.tmpdir(), `dummy-repo-id-collision-${timestamp}`);

  // Create the directory and initialize git repo
  fs.mkdirSync(dummyRepoPath, { recursive: true });
  execSync('git init -q', { cwd: dummyRepoPath });
  execSync('git config user.email "test@example.com"', { cwd: dummyRepoPath });
  execSync('git config user.name "Test User"', { cwd: dummyRepoPath });

  // Create a dummy file and make initial commit
  fs.writeFileSync(path.join(dummyRepoPath, 'test.txt'), 'test content');
  execSync('git add .', { cwd: dummyRepoPath });
  execSync('git commit -q -m "Initial commit"', { cwd: dummyRepoPath });

  // Create main branch (some git versions don't create it by default)
  try {
    execSync('git branch -M main', { cwd: dummyRepoPath });
  } catch (e) {
    // Ignore if branch already exists
  }

  console.log('Created dummy repo at:', dummyRepoPath);
  return dummyRepoPath;
}

/**
 * Helper function to navigate to terminal view for a worktree
 */
async function navigateToWorktree(electronApp: ElectronApplication, page: Page, repoPath: string) {
  // Verify the app launches with project selector
  await expect(page.locator('h2', { hasText: 'Select a Project' })).toBeVisible({ timeout: 10000 });

  // Click the "Open Project Folder" button
  const openButton = page.locator('button', { hasText: 'Open Project Folder' });
  await expect(openButton).toBeVisible();

  // Mock the Electron dialog to return our dummy repository path
  await electronApp.evaluate(async ({ dialog }, repoPath) => {
    dialog.showOpenDialog = async () => {
      return {
        canceled: false,
        filePaths: [repoPath]
      };
    };
  }, repoPath);

  // Click the open button which will trigger the mocked dialog
  await openButton.click();

  // Wait for worktree list to appear
  await page.waitForTimeout(3000);

  // Find and click the worktree button
  const worktreeButton = page.locator('button[data-worktree-branch="main"]');
  expect(await worktreeButton.count()).toBeGreaterThan(0);
  await worktreeButton.click();

  // Wait for the terminal to load
  await page.waitForTimeout(3000);
}

test.describe('Terminal ID Collision - PTY Leak Prevention', () => {
  // Set timeout for all tests including beforeEach/afterEach hooks
  test.describe.configure({ timeout: 120000 });

  let electronApp: ElectronApplication;
  let page: Page;
  let testRepoPath: string;

  test.beforeEach(async () => {
    // Create a test repository
    testRepoPath = createDummyRepo();

    const appDir = path.join(__dirname, '..');
    console.log('Using test main file:', path.join(__dirname, '../dist/main/test-index.js'));

    const result = await launchElectronAppWithWindow({
      disableQuitDialog: true,
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

    // Cleanup
    if (testRepoPath && fs.existsSync(testRepoPath)) {
      try {
        fs.rmSync(testRepoPath, { recursive: true, force: true });
        console.log('Cleaned up dummy repo');
      } catch (e) {
        console.error('Failed to clean up dummy repo:', e);
      }
    }
  });

  test('should not leak PTYs when rapidly splitting terminals', async () => {
    test.setTimeout(60000);

    await page.waitForLoadState('domcontentloaded');

    // Navigate to worktree terminal
    await navigateToWorktree(electronApp, page, testRepoPath);

    // Wait for first terminal to load
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });

    // Get initial PTY count
    const initialStats = await page.evaluate(() => {
      return (window as any).electronAPI.shell.getStats();
    });

    const initialCount = initialStats.activeProcessCount;
    console.log('Initial PTY count:', initialCount);

    // Rapidly split terminals 5 times
    // Before fix: some splits would reuse same terminal ID, causing PTY leaks
    // After fix: each split gets unique ID, no leaks
    for (let i = 0; i < 5; i++) {
      const splitButton = page.locator('button[title="Split Terminal Vertically"]').first();
      await splitButton.click();

      // Small delay to allow split to process (but fast enough to test for collisions)
      await page.waitForTimeout(50);
    }

    // Wait for all terminals to initialize
    await page.waitForTimeout(2000);

    // Get final PTY count - should be initialCount + 5 (no leaks)
    const finalStats = await page.evaluate(() => {
      return (window as any).electronAPI.shell.getStats();
    });

    const finalCount = finalStats.activeProcessCount;
    console.log('Final PTY count:', finalCount);
    console.log('Expected:', initialCount + 5);

    // Verify no PTY leaks occurred
    // Before fix: finalCount would be > initialCount + 5 due to leaked PTYs
    // After fix: finalCount === initialCount + 5 (exactly one PTY per split)
    expect(finalCount).toBe(initialCount + 5);
  });
});
