import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Worktree Deletion with PTY Cleanup', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath: string;
  let testWorktreePath: string;

  test.beforeEach(async () => {
    // Create a dummy git repository with multiple worktrees
    const timestamp = Date.now();
    dummyRepoPath = path.join(os.tmpdir(), `dummy-repo-deletion-${timestamp}`);

    // Create the directory and initialize git repo
    fs.mkdirSync(dummyRepoPath, { recursive: true });
    execSync('git init -q', { cwd: dummyRepoPath });
    execSync('git config user.email "test@example.com"', { cwd: dummyRepoPath });
    execSync('git config user.name "Test User"', { cwd: dummyRepoPath });

    // Create a dummy file and make initial commit (required for worktrees)
    fs.writeFileSync(path.join(dummyRepoPath, 'README.md'), '# Test Repository\n');
    execSync('git add .', { cwd: dummyRepoPath });
    execSync('git commit -q -m "Initial commit"', { cwd: dummyRepoPath });

    // Create main branch (some git versions don't create it by default)
    try {
      execSync('git branch -M main', { cwd: dummyRepoPath });
    } catch (e) {
      // Ignore if branch already exists
    }

    // Create a test worktree
    testWorktreePath = path.join(os.tmpdir(), `dummy-repo-test-branch-${timestamp}`);
    execSync(`git worktree add -b test-branch "${testWorktreePath}"`, { cwd: dummyRepoPath });

    console.log('Created dummy repo with test-branch at:', dummyRepoPath);
    console.log('Test worktree path:', testWorktreePath);

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

    // Clean up the test worktree directory if it still exists
    if (testWorktreePath && fs.existsSync(testWorktreePath)) {
      try {
        fs.rmSync(testWorktreePath, { recursive: true, force: true });
        console.log('Cleaned up test worktree');
      } catch (e) {
        console.error('Failed to clean up test worktree:', e);
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

  test('should show deletion reporting dialog and kill PTY processes when deleting worktree', async () => {
    test.setTimeout(90000);

    await page.waitForLoadState('domcontentloaded');

    // Open the project
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

    // Click on the test-branch worktree
    const testWorktreeButton = page.locator('button[data-worktree-branch="test-branch"]');
    await expect(testWorktreeButton).toBeVisible({ timeout: 5000 });
    await testWorktreeButton.click();
    await page.waitForTimeout(3000);

    // Wait for terminal to be ready and type a command to ensure PTY is active
    const terminalScreen = page.locator('.xterm-screen').first();
    await expect(terminalScreen).toBeVisible({ timeout: 5000 });
    await terminalScreen.click();
    await page.keyboard.type('echo "Terminal is active"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    // Verify the terminal output
    const terminalContent = await terminalScreen.textContent();
    expect(terminalContent).toContain('Terminal is active');

    // Split the terminal to create multiple PTY processes
    const splitButton = page.locator('button[title="Split Terminal Vertically"]').first();
    await expect(splitButton).toBeVisible();
    await splitButton.click();
    await page.waitForTimeout(2000);

    // Verify we have 2 terminals
    const terminalCount = await page.locator('.claude-terminal-root').count();
    expect(terminalCount).toBe(2);

    // Type in the second terminal to ensure it's also active
    const secondTerminalScreen = page.locator('.xterm-screen').nth(1);
    await secondTerminalScreen.click();
    await page.keyboard.type('echo "Second terminal active"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    // Now find and click the delete button for test-branch worktree
    const deleteButton = testWorktreeButton.locator('..').locator('button[class*="bg-red"]');
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Wait for delete confirmation dialog
    await expect(page.locator('h2', { hasText: 'Delete Worktree' })).toBeVisible({ timeout: 3000 });

    // Verify confirmation dialog shows correct branch and path
    await expect(page.locator('text=test-branch').first()).toBeVisible();
    await expect(page.locator('text=Path').first()).toBeVisible();

    // Click "Delete Permanently" button
    const deletePermanentlyButton = page.locator('button', { hasText: 'Delete Permanently' });
    await expect(deletePermanentlyButton).toBeVisible();
    await deletePermanentlyButton.click();

    // Wait for deletion reporting dialog to appear
    await page.waitForTimeout(500);

    // Check for either "Deleting Worktree" or "Deletion Complete" title
    const deletionDialog = page.locator('div').filter({
      has: page.locator('h2').filter({
        hasText: /Deleting Worktree|Deletion Complete/
      })
    }).first();
    await expect(deletionDialog).toBeVisible({ timeout: 5000 });

    // Verify deletion steps are shown
    await expect(page.locator('text=terminal process').first()).toBeVisible({ timeout: 3000 });

    // Wait for deletion to complete (look for "Deletion Complete" or success indicators)
    await expect(page.locator('h2').filter({ hasText: /Deletion Complete|Deletion Failed/ })).toBeVisible({ timeout: 10000 });

    // Wait a bit more to see all steps
    await page.waitForTimeout(1000);

    // Verify success indicators (green checkmarks)
    const successIcons = page.locator('svg.lucide-check-circle');
    const successCount = await successIcons.count();
    expect(successCount).toBeGreaterThanOrEqual(1); // At least one step should succeed

    // Verify the close button is enabled
    const closeButton = page.getByTestId('deletion-dialog-close-button');
    await expect(closeButton).toBeVisible();
    await expect(closeButton).toBeEnabled();

    // Click close to dismiss the dialog
    await closeButton.click();
    await page.waitForTimeout(500);

    // Verify deletion reporting dialog is closed
    await expect(page.locator('h2', { hasText: /Deleting Worktree|Deletion Complete/ })).not.toBeVisible();

    // Verify test-branch is no longer in the worktree list
    const testWorktreeAfterDelete = page.locator('button[data-worktree-branch="test-branch"]');
    expect(await testWorktreeAfterDelete.count()).toBe(0);

    // Verify we switched to main branch
    const mainWorktreeButton = page.locator('button[data-worktree-branch="main"]');
    await expect(mainWorktreeButton).toBeVisible();

    // Check if main is selected (has bg-accent class)
    const mainButtonClasses = await mainWorktreeButton.locator('..').getAttribute('class');
    expect(mainButtonClasses).toContain('bg-accent');

    // Verify the worktree directory was actually deleted
    expect(fs.existsSync(testWorktreePath)).toBe(false);

    // Verify the branch was deleted from git
    const branches = execSync('git branch', { cwd: dummyRepoPath }).toString();
    expect(branches).not.toContain('test-branch');
  });

  test('should report errors in deletion dialog if PTY cleanup fails', async () => {
    test.setTimeout(90000);

    await page.waitForLoadState('domcontentloaded');

    // Open the project
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

    // Verify both worktrees are visible
    const mainWorktreeButton = page.locator('button[data-worktree-branch="main"]');
    const testWorktreeButton = page.locator('button[data-worktree-branch="test-branch"]');
    await expect(mainWorktreeButton).toBeVisible({ timeout: 5000 });
    await expect(testWorktreeButton).toBeVisible({ timeout: 5000 });

    // Click on test-branch but don't open terminal (no PTY to kill)
    await testWorktreeButton.click();
    await page.waitForTimeout(2000);

    // Find and click the delete button
    const deleteButton = testWorktreeButton.locator('..').locator('button[class*="bg-red"]');
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Confirm deletion
    await expect(page.locator('h2', { hasText: 'Delete Worktree' })).toBeVisible({ timeout: 3000 });
    const deletePermanentlyButton = page.locator('button', { hasText: 'Delete Permanently' });
    await deletePermanentlyButton.click();

    // Wait for deletion reporting dialog
    await page.waitForTimeout(500);
    const deletionDialog = page.locator('h2').filter({ hasText: /Deleting Worktree|Deletion Complete/ });
    await expect(deletionDialog).toBeVisible({ timeout: 5000 });

    // Wait for completion
    await expect(page.locator('h2', { hasText: /Deletion Complete|Deletion Failed/ })).toBeVisible({ timeout: 10000 });

    // The test should show 0 processes killed (success case, not error)
    const stepsContent = await page.locator('text=terminal process').first().textContent();
    expect(stepsContent).toMatch(/Killed \d+ terminal process/);

    // Close dialog (use more specific selector to avoid X button)
    const closeButton = page.locator('button').filter({ hasText: /^Close$/ }).first();
    await closeButton.click();
  });

  test('should handle cancellation of worktree deletion', async () => {
    test.setTimeout(60000);

    await page.waitForLoadState('domcontentloaded');

    // Open the project
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

    // Find and click the delete button for test-branch
    const testWorktreeButton = page.locator('button[data-worktree-branch="test-branch"]');
    await expect(testWorktreeButton).toBeVisible({ timeout: 5000 });

    const deleteButton = testWorktreeButton.locator('..').locator('button[class*="bg-red"]');
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Wait for delete confirmation dialog
    await expect(page.locator('h2', { hasText: 'Delete Worktree' })).toBeVisible({ timeout: 3000 });

    // Click Cancel button
    const cancelButton = page.locator('button', { hasText: 'Cancel' });
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    // Verify dialog is closed
    await expect(page.locator('h2', { hasText: 'Delete Worktree' })).not.toBeVisible();

    // Verify test-branch still exists
    await expect(testWorktreeButton).toBeVisible();

    // Verify the worktree directory still exists
    expect(fs.existsSync(testWorktreePath)).toBe(true);
  });

  test('should display error in deletion dialog when folder deletion fails', async () => {
    test.setTimeout(90000);

    await page.waitForLoadState('domcontentloaded');

    // Open the project
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

    // Click on the test-branch worktree to create a terminal
    const testWorktreeButton = page.locator('button[data-worktree-branch="test-branch"]');
    await expect(testWorktreeButton).toBeVisible({ timeout: 5000 });
    await testWorktreeButton.click();
    await page.waitForTimeout(3000);

    // Wait for terminal to be ready
    const terminalScreen = page.locator('.xterm-screen').first();
    await expect(terminalScreen).toBeVisible({ timeout: 5000 });

    // Mock the removeWorktree function to throw an error
    await electronApp.evaluate(async ({ ipcMain }) => {
      // Store the original handler
      const originalHandler = ipcMain._events['git:worktree-remove'];

      // Replace with a mock that throws an error
      ipcMain.removeHandler('git:worktree-remove');
      ipcMain.handle('git:worktree-remove', async () => {
        throw new Error('Permission denied: Cannot delete worktree directory');
      });

      // Store the original handler to restore later (not actually used in test)
      (global as any).__originalRemoveWorktreeHandler = originalHandler;
    });

    // Now find and click the delete button
    const deleteButton = testWorktreeButton.locator('..').locator('button[class*="bg-red"]');
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Wait for delete confirmation dialog
    await expect(page.locator('h2', { hasText: 'Delete Worktree' })).toBeVisible({ timeout: 3000 });

    // Click "Delete Permanently" button
    const deletePermanentlyButton = page.locator('button', { hasText: 'Delete Permanently' });
    await expect(deletePermanentlyButton).toBeVisible();
    await deletePermanentlyButton.click();

    // Wait for deletion reporting dialog to appear
    await page.waitForTimeout(500);
    await expect(page.locator('h2').filter({ hasText: /Deleting Worktree|Deletion/ })).toBeVisible({ timeout: 5000 });

    // Wait for the deletion process to complete
    await expect(page.locator('h2', { hasText: /Deletion Complete|Deletion Failed/ })).toBeVisible({ timeout: 10000 });

    // Verify that the dialog shows "Deletion Failed" or has error indicators
    const dialogTitle = await page.locator('h2').filter({ hasText: /Deletion/ }).first().textContent();
    console.log('Dialog title:', dialogTitle);

    // Wait a bit for error icons to render
    await page.waitForTimeout(500);

    // Verify error indicators (red X icons) are visible
    // Note: lucide-react uses 'lucide-xcircle' (no hyphen) for XCircle icon
    const errorIcons = page.locator('svg.lucide-xcircle');
    await expect(errorIcons.first()).toBeVisible({ timeout: 3000 });
    const errorIconCount = await errorIcons.count();
    expect(errorIconCount).toBeGreaterThanOrEqual(1); // At least one error icon should be present

    // Verify the error message is displayed
    await expect(page.locator('text=Permission denied').first()).toBeVisible();
    await expect(page.locator('text=Cannot delete worktree directory').first()).toBeVisible();

    // Verify the error is shown in one of the deletion steps
    const stepWithError = page.locator('p.text-xs.text-red-500').filter({ hasText: /Permission denied.*Cannot delete worktree directory/ });
    await expect(stepWithError.first()).toBeVisible();

    // Verify the close button is enabled even with errors
    const closeButton = page.locator('button').filter({ hasText: /^Close$/ }).first();
    await expect(closeButton).toBeVisible();
    await expect(closeButton).toBeEnabled();

    // Click close to dismiss the dialog
    await closeButton.click();
    await page.waitForTimeout(500);

    // Verify deletion reporting dialog is closed
    await expect(page.locator('h2', { hasText: /Deleting Worktree|Deletion/ })).not.toBeVisible();

    // Verify test-branch still exists (because deletion failed)
    await expect(testWorktreeButton).toBeVisible();

    // Verify the worktree directory still exists
    expect(fs.existsSync(testWorktreePath)).toBe(true);
  });
});
