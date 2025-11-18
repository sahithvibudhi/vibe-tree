import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import { closeElectronApp } from './helpers/test-launcher';
import { createTestGitRepo, cleanupTestGitRepo } from './helpers/test-git-repo';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Worktree Switch Double Character Bug', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath: string;
  let wt1Path: string;
  let wt2Path: string;

  test.beforeEach(async () => {
    // Create a dummy git repository with two worktrees
    const timestamp = Date.now();
    const { repoPath, worktreePath } = createTestGitRepo({
      nameSuffix: 'repo',
      createWorktree: true,
      worktreeBranch: 'wt1'
    });
    dummyRepoPath = repoPath;
    wt1Path = worktreePath!;

    // Create wt2 worktree with a new branch
    wt2Path = path.join(os.tmpdir(), `dummy-repo-wt2-${timestamp}`);
    execSync(`git worktree add -b wt2 "${wt2Path}"`, { cwd: dummyRepoPath });

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

    // Clean up the test repository and both worktrees
    cleanupTestGitRepo(dummyRepoPath, wt1Path);

    // Clean up wt2 worktree separately
    if (wt2Path && fs.existsSync(wt2Path)) {
      try {
        fs.rmSync(wt2Path, { recursive: true, force: true });
        console.log('Cleaned up wt2 worktree');
      } catch (e) {
        console.error('Failed to clean up wt2 worktree:', e);
      }
    }
  });

  test('should NOT display double characters when switching between worktrees', async () => {
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

    // Use the reliable data-worktree-branch selector
    const wt1Button = page.locator('button[data-worktree-branch="wt1"]');
    const wt1Count = await wt1Button.count();
    
    if (wt1Count === 0) {
      throw new Error('Could not find wt1 worktree button');
    }
    
    console.log('Found wt1 worktree button');

    // First click on wt1
    console.log('Clicking on wt1...');
    await wt1Button.click();
    await page.waitForTimeout(2000);

    // Find and click on wt2 using the data attribute
    const wt2Button = page.locator('button[data-worktree-branch="wt2"]');
    const wt2Count = await wt2Button.count();
    
    if (wt2Count === 0) {
      throw new Error('Could not find wt2 worktree button');
    }
    
    console.log('Found wt2 worktree button');

    console.log('Clicking on wt2...');
    await wt2Button.click();
    await page.waitForTimeout(2000);

    // Click back on wt1
    console.log('Clicking back on wt1...');
    await wt1Button.click();
    await page.waitForTimeout(2000);

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
    await page.waitForTimeout(1000);

    // Type "echo" command
    console.log('Typing "echo" command...');
    await page.keyboard.type('echo');
    await page.waitForTimeout(1000);

    // Get the terminal content from the visible terminal
    const terminalContent = await page.locator('.xterm-screen:visible').first().textContent();
    console.log('Terminal content after typing "echo":', terminalContent);

    // The bug causes "eecchhoo" to appear instead of "echo"
    // This test should FAIL initially (demonstrating the bug exists)
    // and PASS after the fix is applied
    
    // Check that the terminal does NOT contain the doubled characters
    expect(terminalContent).not.toContain('eecchhoo');
    
    // Check that the terminal contains the correct single "echo"
    expect(terminalContent).toContain('echo');
  });
});