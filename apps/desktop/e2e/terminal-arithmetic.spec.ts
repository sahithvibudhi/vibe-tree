import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import { closeElectronApp } from './helpers/test-launcher';
import { createTestGitRepo, cleanupTestGitRepo } from './helpers/test-git-repo';
import path from 'path';

test.describe('Terminal Arithmetic Test', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath: string;

  test.beforeEach(async () => {
    // Create a dummy git repository for testing
    const { repoPath } = createTestGitRepo({ nameSuffix: 'repo' });
    dummyRepoPath = repoPath;

    const testMainPath = path.join(__dirname, '../dist/main/test-index.js');
    console.log('Using test main file:', testMainPath);

    // In CI, we need to specify the app directory explicitly
    const appDir = path.join(__dirname, '..');

    electronApp = await electron.launch({
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TEST_MODE: 'true',
        DISABLE_QUIT_DIALOG: 'true'  // Prevent blocking on quit dialog
      },
      args: [testMainPath],
      cwd: appDir,
    });

    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  }, 45000);

  test.afterEach(async () => {
    if (electronApp) {
      await closeElectronApp(electronApp);
    }

    // Clean up the dummy repository
    cleanupTestGitRepo(dummyRepoPath);
  });

  test('should open terminal window and execute arithmetic', async () => {
    test.setTimeout(60000);

    await page.waitForLoadState('domcontentloaded');

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
    }, dummyRepoPath);

    // Click the open button which will trigger the mocked dialog
    await openButton.click();

    // Wait for worktree list to appear
    await page.waitForTimeout(3000);

    // Try to find the worktree button using data attribute - in the dummy repo it should be main or master
    const worktreeButton = page.locator('button[data-worktree-branch="main"]');

    const worktreeCount = await worktreeButton.count();

    expect(worktreeCount).toBeGreaterThan(0);

    // Click the worktree button to open the terminal
    await worktreeButton.click();

    // Wait for the terminal to load
    await page.waitForTimeout(3000);

    // Find the terminal element
    const terminalSelectors = ['.xterm-screen', '.xterm', '.xterm-container'];
    let terminalElement = null;

    for (const selector of terminalSelectors) {
      const element = page.locator(selector).first();
      if (await element.count() > 0) {
        terminalElement = element;
        break;
      }
    }

    expect(terminalElement).not.toBeNull();

    // Click on the terminal to focus it
    await terminalElement!.click();

    // Wait for focus and shell to be ready
    await page.waitForTimeout(1000);

    // Type the arithmetic command
    const command = 'echo $[101+202]';
    await page.keyboard.type(command);

    // Press Enter to execute
    await page.keyboard.press('Enter');

    // Wait for the output to appear
    await page.waitForTimeout(2000);

    // Verify the output "303" appears in the terminal
    const terminalContent = await page.locator('.xterm-screen').textContent();
    expect(terminalContent).toContain('303');
  });
});
