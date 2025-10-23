import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Worktree posix_spawnp Stress Test', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath: string;
  const createdWorktrees: string[] = [];
  let posixSpawnpErrorOccurred = false;

  test.beforeEach(async () => {
    // Create a dummy git repository
    const timestamp = Date.now();
    dummyRepoPath = path.join(os.tmpdir(), `dummy-repo-stress-${timestamp}`);

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

    console.log('Created dummy repo at:', dummyRepoPath);

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
  }, 60000);

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.evaluate(() => process.exit(0));
    }

    // Clean up all created worktrees
    for (const worktreePath of createdWorktrees) {
      if (fs.existsSync(worktreePath)) {
        try {
          fs.rmSync(worktreePath, { recursive: true, force: true });
          console.log('Cleaned up worktree:', worktreePath);
        } catch (e) {
          console.error('Failed to clean up worktree:', worktreePath, e);
        }
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

  // This stress test verifies the posix_spawnp error recovery
  // It creates worktrees until hitting resource limits, then verifies recovery after cleanup
  test('should create worktrees until posix_spawnp error, then recover after deletion', async () => {
    test.setTimeout(1200000); // 20 minutes timeout for CI

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

    // Verify main worktree is visible
    const mainWorktreeButton = page.locator('button[data-worktree-branch="main"]');
    await expect(mainWorktreeButton).toBeVisible({ timeout: 5000 });

    let worktreeCount = 0;
    let consecutiveSuccesses = 0;
    const MAX_WORKTREES = 300; // Safety limit
    const ERROR_PATTERNS = [
      'posix_spawnp failed',
      'EMFILE',
      'ENFILE',
      'too many open files',
      'Cannot create PTY',
      'Failed to spawn',
      'spawn failed'
    ];

    console.log('Starting continuous worktree creation test...');

    // Phase 1: Create worktrees until we hit posix_spawnp error
    while (worktreeCount < MAX_WORKTREES && !posixSpawnpErrorOccurred) {
      worktreeCount++;
      const branchName = `worktree-${String(worktreeCount).padStart(3, '0')}`;
      const worktreePath = path.join(os.tmpdir(), `stress-test-${branchName}-${Date.now()}`);

      console.log(`Creating worktree ${worktreeCount}: ${branchName}`);

      try {
        // Create worktree via git
        execSync(`git worktree add -b ${branchName} "${worktreePath}"`, { cwd: dummyRepoPath });
        createdWorktrees.push(worktreePath);

        // Wait for UI to update
        await page.waitForTimeout(500);

        // Find the new worktree button
        const newWorktreeButton = page.locator(`button[data-worktree-branch="${branchName}"]`);

        // Wait a bit for it to appear
        let buttonVisible = false;
        for (let i = 0; i < 6; i++) {
          const count = await newWorktreeButton.count();
          if (count > 0) {
            buttonVisible = true;
            break;
          }
          await page.waitForTimeout(300);
        }

        if (!buttonVisible) {
          console.log(`Warning: Worktree button not visible for ${branchName}, skipping click`);
          continue;
        }

        // Click on the worktree
        await newWorktreeButton.click();
        await page.waitForTimeout(1000);

        // Wait for terminal to appear
        const terminalScreen = page.locator('.xterm-screen').first();
        const terminalVisible = await terminalScreen.isVisible().catch(() => false);

        if (terminalVisible) {
          // Try to interact with terminal to verify PTY is working
          await terminalScreen.click();
          await page.keyboard.type(`echo "Test ${worktreeCount}"`);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(800);

          // Check terminal content for errors
          const terminalContent = await terminalScreen.textContent();

          // Check for error patterns
          const hasError = ERROR_PATTERNS.some(pattern =>
            terminalContent?.toLowerCase().includes(pattern.toLowerCase())
          );

          if (hasError) {
            console.log(`ERROR DETECTED in worktree ${worktreeCount}!`);
            console.log('Terminal content:', terminalContent);
            posixSpawnpErrorOccurred = true;
            break;
          }

          // Check if the echo command output is present
          if (terminalContent?.includes(`Test ${worktreeCount}`)) {
            consecutiveSuccesses++;
            console.log(`✓ Worktree ${worktreeCount} terminal is working (${consecutiveSuccesses} consecutive successes)`);
          } else {
            console.log(`⚠ Worktree ${worktreeCount} terminal may not be responding properly`);
            console.log('Terminal content:', terminalContent?.substring(0, 200));
          }
        } else {
          console.log(`Warning: Terminal not visible for ${branchName}`);
        }

        // Check browser console for errors
        const consoleLogs = await page.evaluate(() => {
          return (window as any).__testConsoleErrors || [];
        });

        if (consoleLogs && consoleLogs.length > 0) {
          const hasConsoleError = consoleLogs.some((log: string) =>
            ERROR_PATTERNS.some(pattern => log.toLowerCase().includes(pattern.toLowerCase()))
          );

          if (hasConsoleError) {
            console.log(`ERROR DETECTED in console for worktree ${worktreeCount}!`);
            console.log('Console errors:', consoleLogs);
            posixSpawnpErrorOccurred = true;
            break;
          }
        }

      } catch (error) {
        console.log(`Error creating/testing worktree ${worktreeCount}:`, error);

        // Check if the error message contains our target error
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isTargetError = ERROR_PATTERNS.some(pattern =>
          errorMessage.toLowerCase().includes(pattern.toLowerCase())
        );

        if (isTargetError) {
          console.log(`TARGET ERROR FOUND: ${errorMessage}`);
          posixSpawnpErrorOccurred = true;
          break;
        }

        // For other errors, continue but log them
        console.log('Continuing despite error...');
      }
    }

    // Report results of Phase 1
    console.log('\n=== PHASE 1 RESULTS ===');
    console.log(`Created ${worktreeCount} worktrees`);
    console.log(`posix_spawnp error occurred: ${posixSpawnpErrorOccurred}`);
    console.log(`Consecutive successful worktrees: ${consecutiveSuccesses}`);

    if (!posixSpawnpErrorOccurred) {
      console.log('WARNING: Did not encounter posix_spawnp error within limit');
      console.log('Test will proceed with worktree deletion/recreation verification anyway');
    }

    // Phase 2: Delete 2 worktrees
    console.log('\n=== PHASE 2: DELETING 2 WORKTREES ===');

    const worktreesToDelete = [
      `worktree-${String(Math.min(worktreeCount, 1)).padStart(3, '0')}`,
      `worktree-${String(Math.min(worktreeCount, 2)).padStart(3, '0')}`
    ];

    for (const branchToDelete of worktreesToDelete) {
      console.log(`Deleting ${branchToDelete}...`);

      const worktreeButton = page.locator(`button[data-worktree-branch="${branchToDelete}"]`);
      const buttonExists = await worktreeButton.count() > 0;

      if (!buttonExists) {
        console.log(`Worktree ${branchToDelete} not found in UI, skipping`);
        continue;
      }

      // Find and click delete button
      const deleteButton = worktreeButton.locator('..').locator('button[class*="bg-red"]');
      await expect(deleteButton).toBeVisible({ timeout: 3000 });
      await deleteButton.click();

      // Wait for delete confirmation dialog
      await expect(page.locator('h2', { hasText: 'Delete Worktree' })).toBeVisible({ timeout: 3000 });

      // Click "Delete Permanently" button
      const deletePermanentlyButton = page.locator('button', { hasText: 'Delete Permanently' });
      await expect(deletePermanentlyButton).toBeVisible();
      await deletePermanentlyButton.click();

      // Wait for deletion to complete
      await page.waitForTimeout(500);

      // Check if deletion dialog appeared and wait for completion
      const deletionDialog = page.locator('h2').filter({ hasText: /Deleting Worktree|Deletion Complete/ });
      const dialogVisible = await deletionDialog.isVisible().catch(() => false);

      if (dialogVisible) {
        // Wait for completion
        await expect(page.locator('h2').filter({ hasText: /Deletion Complete|Deletion Failed/ }))
          .toBeVisible({ timeout: 10000 });

        // Close the dialog
        const closeButton = page.getByTestId('deletion-dialog-close-button');
        await closeButton.click();
        await page.waitForTimeout(300);
      }

      console.log(`✓ Deleted ${branchToDelete}`);
      await page.waitForTimeout(500);
    }

    // Phase 3: Create a new worktree and verify terminal works
    console.log('\n=== PHASE 3: CREATING NEW WORKTREE AFTER DELETION ===');

    const newBranchName = `worktree-${String(worktreeCount + 1).padStart(3, '0')}`;
    const newWorktreePath = path.join(os.tmpdir(), `stress-test-${newBranchName}-${Date.now()}`);

    console.log(`Creating new worktree: ${newBranchName}`);
    execSync(`git worktree add -b ${newBranchName} "${newWorktreePath}"`, { cwd: dummyRepoPath });
    createdWorktrees.push(newWorktreePath);

    // Wait for UI to update
    await page.waitForTimeout(1000);

    // Find and click the new worktree
    const newWorktreeButton = page.locator(`button[data-worktree-branch="${newBranchName}"]`);

    // Wait for button to appear
    let buttonAppeared = false;
    for (let i = 0; i < 12; i++) {
      const count = await newWorktreeButton.count();
      if (count > 0) {
        buttonAppeared = true;
        break;
      }
      await page.waitForTimeout(300);
    }

    expect(buttonAppeared).toBe(true);
    await newWorktreeButton.click();
    await page.waitForTimeout(1500);

    // Verify terminal is working
    const terminalScreen = page.locator('.xterm-screen').first();
    await expect(terminalScreen).toBeVisible({ timeout: 10000 });

    await terminalScreen.click();
    await page.keyboard.type('echo "Recovery Test Successful"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Verify terminal output
    const terminalContent = await terminalScreen.textContent();
    console.log('New terminal content:', terminalContent?.substring(0, 200));

    // Check for errors
    const hasError = ERROR_PATTERNS.some(pattern =>
      terminalContent?.toLowerCase().includes(pattern.toLowerCase())
    );

    expect(hasError).toBe(false);
    expect(terminalContent).toContain('Recovery Test Successful');

    console.log('\n=== TEST COMPLETE ===');
    console.log('✓ Successfully created new worktree after deletion');
    console.log('✓ Terminal is working correctly');
    console.log(`Total worktrees created: ${worktreeCount + 1}`);
  });
});
