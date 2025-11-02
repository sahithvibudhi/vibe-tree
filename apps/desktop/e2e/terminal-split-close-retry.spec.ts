import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

/**
 * Helper function to create a dummy git repository for testing
 */
function createDummyRepo(): string {
  const timestamp = Date.now();
  const dummyRepoPath = path.join(os.tmpdir(), `dummy-repo-split-close-${timestamp}`);

  // Create the directory and initialize git repo
  fs.mkdirSync(dummyRepoPath, { recursive: true });
  execSync('git init -q', { cwd: dummyRepoPath });
  execSync('git config user.email "test@example.com"', { cwd: dummyRepoPath });
  execSync('git config user.name "Test User"', { cwd: dummyRepoPath });
  // Disable all hooks for this test repo
  execSync('git config core.hooksPath /dev/null', { cwd: dummyRepoPath });

  // Create a dummy file and make initial commit (required for branches/worktrees)
  fs.writeFileSync(path.join(dummyRepoPath, 'README.md'), '# Test Repository\n');
  execSync('git add .', { cwd: dummyRepoPath });
  execSync('git commit -q -m "Initial commit" --no-verify', { cwd: dummyRepoPath });

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

test.describe('Terminal Split Close Retry', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath: string;

  test.beforeEach(async () => {
    // Create a dummy git repository for testing
    dummyRepoPath = createDummyRepo();

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
      await electronApp.evaluate(() => process.exit(0));
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

  test('should allow closing terminal split', async () => {
    test.setTimeout(60000);

    await page.waitForLoadState('domcontentloaded');

    // Navigate to worktree terminal
    await navigateToWorktree(electronApp, page, dummyRepoPath);

    // Verify initial terminal is present
    const initialTerminal = page.locator('.claude-terminal-root').first();
    await expect(initialTerminal).toBeVisible();

    // Count initial terminals (should be 1)
    const initialTerminalCount = await page.locator('.claude-terminal-root').count();
    expect(initialTerminalCount).toBe(1);

    // Split the terminal to create a second one
    const splitButton = page.locator('button[title="Split Terminal Vertically"]').first();
    await expect(splitButton).toBeVisible();
    await splitButton.click();

    // Wait for the new terminal to appear
    await page.waitForTimeout(2000);

    // Verify we now have 2 terminals
    const splitTerminalCount = await page.locator('.claude-terminal-root').count();
    expect(splitTerminalCount).toBe(2);

    // Close the first terminal
    const closeButton = page.locator('button[title="Close Terminal"]').first();
    await expect(closeButton).toBeVisible();
    await closeButton.click();

    // Wait for close operation to complete
    await page.waitForTimeout(3000);

    // Verify we're back to 1 terminal
    const afterCloseCount = await page.locator('.claude-terminal-root').count();
    expect(afterCloseCount).toBe(1);

    // Verify the remaining terminal has the disabled close button
    const disabledCloseButton = page.locator('button[title="Cannot close last terminal"]').first();
    await expect(disabledCloseButton).toBeVisible();
    await expect(disabledCloseButton).toBeDisabled();
  });

  test('should allow multiple rapid close attempts on different terminals', async () => {
    test.setTimeout(60000);

    await page.waitForLoadState('domcontentloaded');

    // Navigate to worktree terminal
    await navigateToWorktree(electronApp, page, dummyRepoPath);

    // Create 3 terminals by splitting twice
    const splitButton = page.locator('button[title="Split Terminal Vertically"]').first();
    await splitButton.click();
    await page.waitForTimeout(2000);

    const splitButton2 = page.locator('button[title="Split Terminal Vertically"]').first();
    await splitButton2.click();
    await page.waitForTimeout(2000);

    // Verify we have 3 terminals
    let terminalCount = await page.locator('.claude-terminal-root').count();
    expect(terminalCount).toBe(3);

    // Try to close all close buttons rapidly (simulating rapid user clicks)
    const closeButtons = page.locator('button[title="Close Terminal"]');
    const closeButtonCount = await closeButtons.count();

    // Click all close buttons as fast as possible
    for (let i = 0; i < closeButtonCount; i++) {
      const button = closeButtons.nth(i);
      if (await button.isVisible() && !await button.isDisabled()) {
        await button.click();
        // Small delay to let the UI update
        await page.waitForTimeout(100);
      }
    }

    // Wait for cleanup to complete
    await page.waitForTimeout(3000);

    // Verify we're down to 1 terminal
    terminalCount = await page.locator('.claude-terminal-root').count();
    expect(terminalCount).toBe(1);

    // Verify the last terminal cannot be closed
    const disabledCloseButton = page.locator('button[title="Cannot close last terminal"]').first();
    await expect(disabledCloseButton).toBeVisible();
    await expect(disabledCloseButton).toBeDisabled();
  });

  test('should display detailed backtrace when terminal close fails', async () => {
    test.setTimeout(60000);

    // Collect console messages from both renderer and main process
    // Set up listeners BEFORE any navigation to catch all messages
    const consoleMessages: string[] = [];
    const mainConsoleMessages: string[] = [];

    // Renderer process console - capture ALL console output first
    const consoleHandler = (msg: any) => {
      consoleMessages.push(msg.text());
    };
    page.on('console', consoleHandler);

    // Main process console (includes [TEST MODE] Error dialog messages)
    const mainConsoleHandler = (msg: any) => {
      mainConsoleMessages.push(msg.text());
    };
    electronApp.on('console', mainConsoleHandler);

    await page.waitForLoadState('domcontentloaded');

    // Navigate to worktree terminal
    await navigateToWorktree(electronApp, page, dummyRepoPath);

    // Split the terminal to create a second one
    const splitButton = page.locator('button[title="Split Terminal Vertically"]').first();
    await expect(splitButton).toBeVisible();
    await splitButton.click();

    // Wait for the new terminal to appear
    await page.waitForTimeout(2000);

    // Verify we have 2 terminals
    let terminalCount = await page.locator('.claude-terminal-root').count();
    expect(terminalCount).toBe(2);

    // Mock the shell terminate handler to fail with a specific error message
    await electronApp.evaluate(({ ipcMain }) => {
      // Store the original handler
      const originalHandler = ipcMain.listeners('shell:terminate')[0];

      // Remove the original handler
      ipcMain.removeHandler('shell:terminate');

      // Add a handler that will fail with a specific error message
      ipcMain.handle('shell:terminate', async () => {
        // Return success: false with a specific error message
        return { success: false, error: 'Process is locked and cannot be terminated (EPERM)' };
      });

      // Store the original handler so we can restore it later
      (global as any).__originalTerminateHandler = originalHandler;
    });

    // Clear previous console messages
    consoleMessages.length = 0;
    mainConsoleMessages.length = 0;

    // Try to close the first terminal - this should fail and show error with backtrace
    const closeButton = page.locator('button[title="Close Terminal"]').first();
    await expect(closeButton).toBeVisible();
    await closeButton.click();

    // Wait for error handling to complete
    await page.waitForTimeout(3000);

    // Restore the original handler
    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('shell:terminate');
      if ((global as any).__originalTerminateHandler) {
        ipcMain.handle('shell:terminate', (global as any).__originalTerminateHandler);
      }
    });

    // Combine all console messages
    const allMessages = [...consoleMessages, ...mainConsoleMessages].join('\n');

    // Should contain the specific error message from the API
    expect(allMessages).toContain('Process is locked and cannot be terminated (EPERM)');

    // Should contain error about failing to terminate with the specific reason
    expect(allMessages).toContain('Failed to terminate PTY process');

    // Should contain stack trace elements (at least one stack frame with "at")
    // The error.stack should include the stack trace with "at" prefix
    const hasStackTrace = allMessages.includes('at ') &&
                         (allMessages.includes('handleTerminalClose') ||
                          allMessages.includes('TerminalController'));

    // The key validation: error logs should contain detailed information
    expect(allMessages).toContain('TerminalController');
    expect(hasStackTrace).toBe(true);

    // Verify error was logged (even if stack trace format varies)
    console.log('Console messages captured:', allMessages);

    // The terminal should still be removed from UI despite the error
    await page.waitForTimeout(1000);
    terminalCount = await page.locator('.claude-terminal-root').count();
    expect(terminalCount).toBe(1);

    // Clean up event listeners
    page.off('console', consoleHandler);
    electronApp.off('console', mainConsoleHandler);
  });
});
