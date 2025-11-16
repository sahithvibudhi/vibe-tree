import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';
import { closeElectronApp } from './helpers/test-launcher';

/**
 * Test to verify that rapid terminal splits don't cause PTY leaks due to ID collisions
 *
 * Before fix: Using Date.now() for terminal IDs caused collisions when splitting rapidly,
 * leading to PTY file descriptor leaks.
 *
 * After fix: Using a monotonic counter ensures unique IDs, preventing leaks.
 */

let electronApp: ElectronApplication;
let window: Page;
let testRepoPath: string;

test.beforeAll(async () => {
  // Create a test repository
  testRepoPath = path.join(os.tmpdir(), `dummy-repo-id-collision-${Date.now()}`);
  fs.mkdirSync(testRepoPath, { recursive: true });

  execSync('git init', { cwd: testRepoPath });
  execSync('git config user.email "test@example.com"', { cwd: testRepoPath });
  execSync('git config user.name "Test User"', { cwd: testRepoPath });

  fs.writeFileSync(path.join(testRepoPath, 'test.txt'), 'test content');
  execSync('git add .', { cwd: testRepoPath });
  execSync('git commit -m "Initial commit"', { cwd: testRepoPath });

  console.log('Created dummy repo at:', testRepoPath);

  // Use the test main file
  const testMainPath = path.join(__dirname, '../dist/main/test-index.js');
  console.log('Using test main file:', testMainPath);

  electronApp = await electron.launch({
    args: [testMainPath],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DISABLE_QUIT_DIALOG: 'true'
    }
  });

  window = await electronApp.firstWindow();
});

test.afterAll(async () => {
  // Use process.exit to avoid slow shutdown timeouts
  await closeElectronApp(electronApp);

  // Cleanup
  if (fs.existsSync(testRepoPath)) {
    fs.rmSync(testRepoPath, { recursive: true, force: true });
    console.log('Cleaned up dummy repo');
  }
});

test('should not leak PTYs when rapidly splitting terminals', async () => {
  // Wait for app to be ready
  await expect(window.locator('h2', { hasText: 'Select a Project' })).toBeVisible({ timeout: 10000 });

  // Mock the dialog to return our test repo
  await electronApp.evaluate(async ({ dialog }, repoPath) => {
    dialog.showOpenDialog = async () => {
      return {
        canceled: false,
        filePaths: [repoPath]
      };
    };
  }, testRepoPath);

  // Click Open Project Folder
  const openButton = window.locator('button', { hasText: 'Open Project Folder' });
  await openButton.click();

  // Wait for worktree list to appear and button to be visible
  const worktreeButton = window.locator('button[data-worktree-branch="main"]');
  await expect(worktreeButton).toBeVisible({ timeout: 30000 });
  await worktreeButton.click();

  // Wait for first terminal to load
  await window.waitForSelector('.xterm-screen', { timeout: 10000 });

  // Get initial PTY count
  const initialStats = await window.evaluate(() => {
    return (window as any).electronAPI.shell.getStats();
  });

  const initialCount = initialStats.activeProcessCount;
  console.log('Initial PTY count:', initialCount);

  // Rapidly split terminals 5 times
  // Before fix: some splits would reuse same terminal ID, causing PTY leaks
  // After fix: each split gets unique ID, no leaks
  for (let i = 0; i < 5; i++) {
    const splitButton = window.locator('button[title="Split Terminal Vertically"]').first();
    await splitButton.click();

    // Small delay to allow split to process (but fast enough to test for collisions)
    await window.waitForTimeout(50);
  }

  // Wait for all terminals to initialize
  await window.waitForTimeout(2000);

  // Get final PTY count - should be initialCount + 5 (no leaks)
  const finalStats = await window.evaluate(() => {
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
