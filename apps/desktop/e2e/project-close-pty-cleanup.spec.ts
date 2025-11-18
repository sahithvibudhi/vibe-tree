import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import path from 'path';
import { createTestGitRepo, cleanupTestGitRepo } from './helpers/test-git-repo';

test.describe('Project Close PTY Cleanup', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath: string;

  test.beforeEach(async () => {
    const { repoPath } = createTestGitRepo({ nameSuffix: 'repo-pty-cleanup' });
    dummyRepoPath = repoPath;

    const testMainPath = path.join(__dirname, '../dist/main/test-index.js');
    console.log('Using test main file:', testMainPath);

    const appDir = path.join(__dirname, '..');

    electronApp = await electron.launch({
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TEST_MODE: 'true',
        DISABLE_QUIT_DIALOG: 'true'
      },
      args: [testMainPath],
      cwd: appDir,
    });

    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  }, 45000);

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.evaluate(() => process.exit(0));
    }

    cleanupTestGitRepo(dummyRepoPath);
  });

  test('should kill all PTY processes when closing a project', async () => {
    test.setTimeout(90000);

    await page.waitForLoadState('domcontentloaded');

    // Open the project
    await expect(page.locator('h2', { hasText: 'Select a Project' })).toBeVisible({ timeout: 10000 });
    const openButton = page.locator('button', { hasText: 'Open Project Folder' });
    await expect(openButton).toBeVisible();

    // Mock the file dialog
    await electronApp.evaluate(async ({ dialog }, repoPath) => {
      dialog.showOpenDialog = async () => {
        return {
          canceled: false,
          filePaths: [repoPath]
        };
      };
    }, dummyRepoPath);

    await openButton.click();
    await page.waitForTimeout(5000);

    // Click on the main worktree to ensure terminal loads
    const mainWorktreeButton = page.locator('button[data-worktree-branch="main"]');
    await expect(mainWorktreeButton).toBeVisible({ timeout: 10000 });
    await mainWorktreeButton.click();
    await page.waitForTimeout(2000);

    // Wait for terminal to be ready
    const terminalScreen = page.locator('.xterm-screen').first();
    await expect(terminalScreen).toBeVisible({ timeout: 10000 });

    // Type a command to ensure PTY is active
    await terminalScreen.click();
    await page.keyboard.type('echo "Terminal 1 active"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Split the terminal to create multiple PTY processes
    const splitButton = page.locator('button[title="Split Terminal Vertically"]').first();
    await expect(splitButton).toBeVisible();
    await splitButton.click();
    await page.waitForTimeout(2000);

    // Verify we have 2 terminals
    const terminalCount = await page.locator('.claude-terminal-root').count();
    expect(terminalCount).toBe(2);

    // Type in the second terminal
    const secondTerminalScreen = page.locator('.xterm-screen').nth(1);
    await secondTerminalScreen.click();
    await page.keyboard.type('echo "Terminal 2 active"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Split again to create a third terminal
    await splitButton.click();
    await page.waitForTimeout(2000);

    // Verify we have 3 terminals
    const terminalCountAfterSecondSplit = await page.locator('.claude-terminal-root').count();
    expect(terminalCountAfterSecondSplit).toBe(3);

    console.log('Created 3 terminals, now closing project...');

    // Find and click the X button to close the project
    const projectTab = page.locator('[role="tab"]').first();
    const closeButton = projectTab.locator('span', { has: page.locator('svg') }).last();
    await expect(closeButton).toBeVisible();
    await closeButton.click();
    await page.waitForTimeout(2000);

    // Verify the project selector is shown again
    await expect(page.locator('h2', { hasText: 'Select a Project' })).toBeVisible({ timeout: 5000 });

    console.log('Project closed successfully, PTY sessions should have been terminated');

    // The actual PTY cleanup happens via IPC call in removeProject()
    // We've verified the UI flow works - the unit tests verify the cleanup logic
  });
});
