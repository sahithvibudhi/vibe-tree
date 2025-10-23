import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import { closeElectronApp } from './helpers/test-launcher';
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
    dummyRepoPath = path.join(os.tmpdir(), `dummy-repo-${timestamp}`);
    
    // Create the directory and initialize git repo
    fs.mkdirSync(dummyRepoPath, { recursive: true });
    execSync('git init -q', { cwd: dummyRepoPath });
    execSync('git config user.email "test@example.com"', { cwd: dummyRepoPath });
    execSync('git config user.name "Test User"', { cwd: dummyRepoPath });
    
    // Create a dummy file and make initial commit (required for worktrees)
    fs.writeFileSync(path.join(dummyRepoPath, 'README.md'), '# Test Repository\n');
    execSync('git add .', { cwd: dummyRepoPath });
    execSync('git commit -q -m "Initial commit"', { cwd: dummyRepoPath });
    
    // Create worktree directories
    wt1Path = path.join(os.tmpdir(), `dummy-repo-wt1-${timestamp}`);
    wt2Path = path.join(os.tmpdir(), `dummy-repo-wt2-${timestamp}`);
    
    // Create wt1 worktree with a new branch
    execSync(`git worktree add -b wt1 "${wt1Path}"`, { cwd: dummyRepoPath });
    
    // Create wt2 worktree with a new branch
    execSync(`git worktree add -b wt2 "${wt2Path}"`, { cwd: dummyRepoPath });
    
    console.log('Created dummy repo with wt1 and wt2 branches at:', dummyRepoPath);

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
    
    // Clean up the worktree directories first
    if (wt1Path && fs.existsSync(wt1Path)) {
      try {
        fs.rmSync(wt1Path, { recursive: true, force: true });
        console.log('Cleaned up wt1 worktree');
      } catch (e) {
        console.error('Failed to clean up wt1 worktree:', e);
      }
    }
    
    if (wt2Path && fs.existsSync(wt2Path)) {
      try {
        fs.rmSync(wt2Path, { recursive: true, force: true });
        console.log('Cleaned up wt2 worktree');
      } catch (e) {
        console.error('Failed to clean up wt2 worktree:', e);
      }
    }
    
    // Clean up the dummy repository
    if (dummyRepoPath && fs.existsSync(dummyRepoPath)) {
      try {
        fs.rmSync(dummyRepoPath, { recursive: true, force: true });
        console.log('Cleaned up dummy repo');
      } catch (e) {
        console.error('Failed to clean up dummy repo:', e);
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