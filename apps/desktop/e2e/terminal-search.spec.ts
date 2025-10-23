import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import { closeElectronApp } from './helpers/test-launcher';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Terminal Search Functionality', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath: string;

  test.beforeEach(async () => {
    // Create a dummy git repository for testing
    const timestamp = Date.now();
    dummyRepoPath = path.join(os.tmpdir(), `dummy-repo-${timestamp}`);

    // Create the directory and initialize git repo
    fs.mkdirSync(dummyRepoPath, { recursive: true });
    execSync('git init -q', { cwd: dummyRepoPath });
    execSync('git config user.email "test@example.com"', { cwd: dummyRepoPath });
    execSync('git config user.name "Test User"', { cwd: dummyRepoPath });

    // Create a dummy file and make initial commit (required for branches/worktrees)
    fs.writeFileSync(path.join(dummyRepoPath, 'README.md'), '# Test Repository\n');
    execSync('git add .', { cwd: dummyRepoPath });
    execSync('git commit -q -m "Initial commit"', { cwd: dummyRepoPath });

    // Create main branch (some git versions don't create it by default)
    try {
      execSync('git branch -M main', { cwd: dummyRepoPath });
    } catch (e) {
      // Ignore if branch already exists
    }

    console.log('Created dummy repo at:', dummyRepoPath);

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
    if (dummyRepoPath && fs.existsSync(dummyRepoPath)) {
      try {
        fs.rmSync(dummyRepoPath, { recursive: true, force: true });
        console.log('Cleaned up dummy repo');
      } catch (e) {
        console.error('Failed to clean up dummy repo:', e);
      }
    }
  });

  test('should open search bar and search for text in terminal', async () => {
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

    // Add some test content to search for
    const testCommands = ['echo "Hello World"', 'echo "Testing search functionality"', 'ls -la'];

    for (const command of testCommands) {
      await page.keyboard.type(command);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
    }

    // Wait for commands to execute
    await page.waitForTimeout(2000);

    // Test search functionality via search button
    const searchButton = page.locator('button[title*="Search Terminal"]');
    await expect(searchButton).toBeVisible();
    await searchButton.click();

    // Wait for search bar to appear
    await page.waitForTimeout(500);

    // Verify search bar is visible
    const searchInput = page.locator('input[placeholder*="Search terminal"]');
    await expect(searchInput).toBeVisible();

    // Search for "Hello"
    await searchInput.fill('Hello');

    // Wait for search to complete
    await page.waitForTimeout(500);

    // Test keyboard shortcut (Ctrl+F)
    await page.keyboard.press('Escape'); // Close current search
    await page.waitForTimeout(500);

    // Focus the terminal
    await terminalElement!.click();
    await page.waitForTimeout(500);

    // Use Ctrl+F to open search
    await page.keyboard.press('Control+f');
    await page.waitForTimeout(500);

    // Verify search bar opened via keyboard shortcut
    await expect(searchInput).toBeVisible();

    // Search for "Testing"
    await searchInput.fill('Testing');
    await page.waitForTimeout(500);

    // Test navigation buttons
    const previousButton = page.locator('button[title*="Previous match"]');
    const nextButton = page.locator('button[title*="Next match"]');

    await expect(previousButton).toBeVisible();
    await expect(nextButton).toBeVisible();

    // Click next button
    await nextButton.click();
    await page.waitForTimeout(500);

    // Click previous button
    await previousButton.click();
    await page.waitForTimeout(500);

    // Test Enter key for next match
    await searchInput.press('Enter');
    await page.waitForTimeout(500);

    // Test Shift+Enter for previous match
    await searchInput.press('Shift+Enter');
    await page.waitForTimeout(500);

    // Test Escape to close search
    await searchInput.press('Escape');
    await page.waitForTimeout(500);

    // Verify search bar is closed
    await expect(searchInput).not.toBeVisible();

    // Verify terminal is focused after closing search
    const focusedElement = await page.evaluate(() => document.activeElement?.className);
    expect(focusedElement).toContain('xterm');
  });

  test('should handle empty search queries gracefully', async () => {
    test.setTimeout(60000);

    await page.waitForLoadState('domcontentloaded');

    // Navigate to terminal (reusing setup from previous test)
    await expect(page.locator('h2', { hasText: 'Select a Project' })).toBeVisible({ timeout: 10000 });
    const openButton = page.locator('button', { hasText: 'Open Project Folder' });
    await expect(openButton).toBeVisible();

    await electronApp.evaluate(async ({ dialog }, repoPath) => {
      dialog.showOpenDialog = async () => {
        return {
          canceled: false,
          filePaths: [repoPath]
        };
      };
    }, dummyRepoPath);

    await openButton.click();
    await page.waitForTimeout(3000);

    const worktreeButton = page.locator('button[data-worktree-branch="main"]');
    await worktreeButton.click();
    await page.waitForTimeout(3000);

    // Open search
    const searchButton = page.locator('button[title*="Search Terminal"]');
    await searchButton.click();
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder*="Search terminal"]');
    await expect(searchInput).toBeVisible();

    // Test empty search - buttons should be disabled
    const previousButton = page.locator('button[title*="Previous match"]');
    const nextButton = page.locator('button[title*="Next match"]');

    await expect(previousButton).toBeDisabled();
    await expect(nextButton).toBeDisabled();

    // Add some text and verify buttons are enabled
    await searchInput.fill('test');
    await page.waitForTimeout(100);

    await expect(previousButton).toBeEnabled();
    await expect(nextButton).toBeEnabled();

    // Clear text and verify buttons are disabled again
    await searchInput.fill('');
    await page.waitForTimeout(100);

    await expect(previousButton).toBeDisabled();
    await expect(nextButton).toBeDisabled();
  });
});