import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import { closeElectronApp } from './helpers/test-launcher';
import { createTestGitRepo, cleanupTestGitRepo } from './helpers/test-git-repo';
import path from 'path';

/**
 * Tests for terminal DOM cache cleanup when worktree is deleted and recreated.
 *
 * This test verifies that when a worktree is deleted, the terminal DOM cache
 * (worktreeGridCache) is cleaned up properly. Without proper cleanup, stale
 * terminals from the deleted worktree would persist and be shown when the
 * worktree is recreated with the same path.
 */
test.describe('Worktree Terminal Cleanup on Recreate', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath: string;
  // Track worktree path for cleanup - computed dynamically based on how addWorktree creates paths
  let testWorktreePath: string | undefined;

  test.beforeEach(async () => {
    // Create a dummy git repository WITHOUT a worktree
    // We'll use the UI's "Add Worktree" feature to create it, which creates at a deterministic path
    // This is critical: the UI creates worktrees at {projectDir}/../{repoName}-{branchName}
    // so when we delete and recreate with the same branch name, the path is identical
    const { repoPath } = createTestGitRepo({
      nameSuffix: 'terminal-cleanup',
      createWorktree: false  // Don't pre-create worktree - let UI do it
    });
    dummyRepoPath = repoPath;
    // Compute expected worktree path: {projectDir}/../{repoName}-test-branch
    testWorktreePath = path.join(dummyRepoPath, '..', `${path.basename(dummyRepoPath)}-test-branch`);

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
      await closeElectronApp(electronApp);
    }

    // Clean up the test repository and worktree
    cleanupTestGitRepo(dummyRepoPath, testWorktreePath);
  });

  /**
   * Helper function to wait for terminal to be ready by checking for shell prompt.
   * This ensures the terminal has fully initialized before we proceed with actions.
   */
  async function waitForTerminalReady(page: Page, terminalIndex = 0, timeoutMs = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const terminalContent = await page.locator('.xterm-screen').nth(terminalIndex).textContent();

        // Log what we found for debugging
        console.log(`[waitForTerminalReady] Terminal ${terminalIndex} content (last 200 chars): ${terminalContent?.slice(-200)}`);

        // Check for common shell prompt indicators - be more permissive
        // Shell prompts typically end with $, %, >, ], or #
        if (terminalContent && /[$%>\]#]\s*$/.test(terminalContent)) {
          console.log(`[waitForTerminalReady] Terminal ${terminalIndex} is ready (found shell prompt)`);
          return;
        }
      } catch {
        // Terminal might not be visible yet, keep trying
      }

      await page.waitForTimeout(500);
    }

    console.log(`[waitForTerminalReady] WARNING: Terminal ${terminalIndex} may not be ready after ${timeoutMs}ms, proceeding anyway`);
  }

  test('should clean up terminal DOM when worktree is deleted and recreated', async () => {
    test.setTimeout(180000); // 3 minutes

    await page.waitForLoadState('domcontentloaded');

    // Open the project
    await expect(page.locator('h2', { hasText: 'Select a Project' })).toBeVisible();
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

    // Wait for project to load - the "Add Worktree" button appears when project is loaded
    // At this point, only the main branch worktree exists (project root)
    // We need to create test-branch worktree via UI first
    // This is critical: the UI creates worktrees at a deterministic path:
    // {projectDir}/../{repoName}-{branchName}
    // So when we delete and recreate, the path is identical = cache collision = bug

    // Click the "Add Worktree" button to create test-branch
    const addWorktreeButton = page.locator('[data-testid="add-worktree-button"]');
    await expect(addWorktreeButton).toBeVisible();
    await addWorktreeButton.click();

    // Wait for the "Create New Feature Branch" dialog
    await expect(page.locator('h2', { hasText: 'Create New Feature Branch' })).toBeVisible();

    // Enter the branch name
    const branchInput = page.locator('input[placeholder="feature-name"]');
    await expect(branchInput).toBeVisible();
    await branchInput.fill('test-branch');

    // Click Create Branch button
    const createBranchButton = page.locator('button', { hasText: 'Create Branch' });
    await expect(createBranchButton).toBeVisible();
    await createBranchButton.click();

    // Wait for the worktree to be created - the worktree button will appear when ready
    const testWorktreeButton = page.locator('button[data-worktree-branch="test-branch"]');
    await expect(testWorktreeButton).toBeVisible({ timeout: 30000 });
    await testWorktreeButton.click();

    // Wait for terminal to be fully ready (shell prompt visible)
    await waitForTerminalReady(page, 0);

    // Verify we have exactly 1 terminal
    let terminalCount = await page.locator('.claude-terminal-root').count();
    console.log(`Terminal count after clicking test-branch: ${terminalCount}`);
    expect(terminalCount).toBe(1);

    // Split the terminal to create 2 terminals
    const splitButton = page.locator('button[title="Split Terminal Vertically"]').first();
    await expect(splitButton).toBeVisible();
    await splitButton.click();

    // Wait for 2 terminals to be visible
    await expect(page.locator('.claude-terminal-root')).toHaveCount(2);
    terminalCount = await page.locator('.claude-terminal-root').count();
    console.log(`Terminal count after split: ${terminalCount}`);

    // Split again to create 3 terminals
    const splitButton2 = page.locator('button[title="Split Terminal Vertically"]').first();
    await splitButton2.click();

    // Wait for 3 terminals to be visible
    await expect(page.locator('.claude-terminal-root')).toHaveCount(3);
    terminalCount = await page.locator('.claude-terminal-root').count();
    console.log(`Terminal count after second split: ${terminalCount}`);

    // Now delete the worktree
    const deleteButton = testWorktreeButton.locator('..').locator('button[class*="bg-red"]');
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Wait for delete confirmation dialog
    await expect(page.locator('h2', { hasText: 'Delete Worktree' })).toBeVisible();

    // Click "Delete Permanently" button
    const deletePermanentlyButton = page.locator('button', { hasText: 'Delete Permanently' });
    await expect(deletePermanentlyButton).toBeVisible();
    await deletePermanentlyButton.click();

    // Wait for deletion reporting dialog to complete
    await expect(page.locator('h2').filter({ hasText: /Deletion Complete|Deletion Failed/ })).toBeVisible({ timeout: 30000 });

    // Close the deletion dialog
    const closeButton = page.getByTestId('deletion-dialog-close-button');
    await expect(closeButton).toBeVisible();
    await closeButton.click();

    // Wait for the deletion dialog to close
    await expect(page.locator('h2').filter({ hasText: /Deletion Complete|Deletion Failed/ })).not.toBeVisible();

    // Verify test-branch is no longer in the worktree list
    await expect(testWorktreeButton).not.toBeVisible();

    // Now recreate the worktree with the same branch name
    // Reuse addWorktreeButton from earlier in the test
    await expect(addWorktreeButton).toBeVisible();
    await addWorktreeButton.click();

    // Wait for the "Create New Feature Branch" dialog
    await expect(page.locator('h2', { hasText: 'Create New Feature Branch' })).toBeVisible();

    // Enter the branch name (reuse branchInput locator)
    await expect(branchInput).toBeVisible();
    await branchInput.fill('test-branch');

    // Click Create Branch button (reuse createBranchButton locator)
    await expect(createBranchButton).toBeVisible();
    await createBranchButton.click();

    // Wait for the recreated worktree button to appear
    const recreatedWorktreeButton = page.locator('button[data-worktree-branch="test-branch"]');
    await expect(recreatedWorktreeButton).toBeVisible({ timeout: 30000 });

    // Click on the recreated worktree to ensure it's selected
    await recreatedWorktreeButton.click();

    // Wait for terminal to initialize
    await waitForTerminalReady(page, 0);

    // THIS IS THE KEY ASSERTION:
    // After deleting and recreating the worktree, there should be exactly 1 terminal
    // (not the 3 stale terminals from the previous worktree)
    terminalCount = await page.locator('.claude-terminal-root').count();
    console.log(`Terminal count immediately after clicking recreated worktree: ${terminalCount}`);

    // If the DOM cache wasn't cleaned up, this would fail with terminalCount = 3
    expect(terminalCount).toBe(1);
  });
});
