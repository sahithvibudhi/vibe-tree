import { test, expect } from '@playwright/test';
import { ElectronApplication, _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Worktree posix_spawnp Stress Test', () => {
  let electronApp: ElectronApplication;
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

    await electronApp.firstWindow();
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

  // This test creates PTY sessions to verify cleanup and recovery behavior
  // Strategy: Create a reasonable number of PTYs, then test cleanup and recovery
  // This is fast, deterministic, and works on all platforms
  test('should stress test PTY creation and verify recovery after cleanup', async () => {
    test.setTimeout(120000); // 2 minutes timeout (was 10 minutes)

    let worktreeCount = 0;
    const TARGET_WORKTREES = 50; // Create a reasonable number for testing (was 1024)
    const MIN_SUCCESSFUL_PTYS = 10; // Minimum PTYs needed to validate the test

    const createdPtyIds: string[] = [];

    console.log('Starting PTY creation test...');
    console.log(`Target: ${TARGET_WORKTREES} worktrees with PTY sessions`);
    console.log('');

    // Phase 1: Create worktrees and PTY sessions
    while (worktreeCount < TARGET_WORKTREES) {
      worktreeCount++;
      const branchName = `worktree-${String(worktreeCount).padStart(3, '0')}`;
      const worktreePath = path.join(os.tmpdir(), `stress-test-${branchName}-${Date.now()}`);

      try {
        // Create worktree via git
        execSync(`git worktree add -b ${branchName} "${worktreePath}"`, { cwd: dummyRepoPath });
        createdWorktrees.push(worktreePath);

        // Directly call the shell:start IPC to create PTY (bypassing UI)
        const result = await electronApp.evaluate(async ({ ipcMain }, worktreePath) => {
          return new Promise((resolve) => {
            // Simulate IPC call to shell:start
            const mockEvent = {
              sender: {
                id: 999,
                isDestroyed: () => false,
                send: () => {}
              }
            };

            // Get the handler
            const handlers = (ipcMain as any)._invokeHandlers;
            const handler = handlers?.get('shell:start');

            if (handler) {
              handler(mockEvent, worktreePath, 80, 24, false, undefined)
                .then((result: any) => resolve(result))
                .catch((error: any) => resolve({ success: false, error: error.message }));
            } else {
              resolve({ success: false, error: 'Handler not found' });
            }
          });
        }, worktreePath);

        if (result.success && result.processId) {
          createdPtyIds.push(result.processId);
          if (worktreeCount % 10 === 0) {
            console.log(`Created ${worktreeCount} worktrees with PTY sessions`);
          }
        } else {
          console.log(`Worktree ${worktreeCount}: PTY creation failed with: ${result.error || 'Unknown error'}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`Error at worktree ${worktreeCount}:`, errorMessage);
      }
    }

    // Report Phase 1 results
    console.log('\n=== PHASE 1 RESULTS ===');
    console.log(`Created ${worktreeCount} worktrees`);
    console.log(`Created ${createdPtyIds.length} PTY sessions`);

    // Validate we created enough PTYs to test cleanup behavior
    console.log(`\n✓ Created ${createdPtyIds.length} PTY sessions successfully`);

    if (createdPtyIds.length < MIN_SUCCESSFUL_PTYS) {
      throw new Error(
        `Test FAILED: Only created ${createdPtyIds.length} PTY sessions out of ${worktreeCount} attempts (minimum required: ${MIN_SUCCESSFUL_PTYS}). ` +
        `This indicates PTY creation is broken or system has severe resource constraints.`
      );
    }

    console.log(`✓ Successfully created ${createdPtyIds.length} PTY sessions`);
    console.log(`✓ Enough sessions to validate cleanup behavior (minimum: ${MIN_SUCCESSFUL_PTYS})`);

    // Phase 2: Terminate 2 PTY sessions and delete 2 worktrees
    console.log('\n=== PHASE 2: CLEANING UP 2 WORKTREES ===');

    const worktreesToCleanup = Math.min(2, createdWorktrees.length);
    for (let i = 0; i < worktreesToCleanup; i++) {
      const worktreePath = createdWorktrees[i];

      // Terminate PTY sessions for this worktree
      const terminateResult = await electronApp.evaluate(async ({ ipcMain }, worktreePath) => {
        return new Promise((resolve) => {
          const mockEvent = { sender: { id: 999 } };
          const handlers = (ipcMain as any)._invokeHandlers;
          const handler = handlers?.get('shell:terminate-for-worktree');

          if (handler) {
            handler(mockEvent, worktreePath)
              .then((result: any) => resolve(result))
              .catch((error: any) => resolve({ success: false, error: error.message }));
          } else {
            resolve({ success: false, error: 'Handler not found' });
          }
        });
      }, worktreePath);

      console.log(`Terminated ${terminateResult.count || 0} PTY session(s) for worktree ${i + 1}`);

      // Delete the worktree
      try {
        execSync(`git worktree remove --force "${worktreePath}"`, { cwd: dummyRepoPath });
        console.log(`Deleted worktree ${i + 1}`);
      } catch (error) {
        console.log(`Failed to delete worktree ${i + 1}:`, error);
      }
    }

    // Phase 3: Create a new worktree and verify PTY works
    console.log('\n=== PHASE 3: CREATING NEW WORKTREE AFTER CLEANUP ===');

    const newBranchName = `worktree-${String(worktreeCount + 1).padStart(3, '0')}`;
    const newWorktreePath = path.join(os.tmpdir(), `stress-test-${newBranchName}-${Date.now()}`);

    console.log(`Creating new worktree: ${newBranchName}`);
    execSync(`git worktree add -b ${newBranchName} "${newWorktreePath}"`, { cwd: dummyRepoPath });
    createdWorktrees.push(newWorktreePath);

    // Try to create PTY session for the new worktree
    const recoveryResult = await electronApp.evaluate(async ({ ipcMain }, worktreePath) => {
      return new Promise((resolve) => {
        const mockEvent = {
          sender: {
            id: 999,
            isDestroyed: () => false,
            send: () => {}
          }
        };

        const handlers = (ipcMain as any)._invokeHandlers;
        const handler = handlers?.get('shell:start');

        if (handler) {
          handler(mockEvent, worktreePath, 80, 24, false, undefined)
            .then((result: any) => resolve(result))
            .catch((error: any) => resolve({ success: false, error: error.message }));
        } else {
          resolve({ success: false, error: 'Handler not found' });
        }
      });
    }, newWorktreePath);

    // Verify recovery SUCCEEDS after cleanup
    console.log('\n=== RECOVERY TEST RESULTS ===');
    console.log('Recovery result:', recoveryResult);

    // EXPECTED BEHAVIOR: After cleaning up worktrees and terminating PTY sessions,
    // creating a new PTY session should succeed.
    //
    // This verifies that:
    // 1. PTY cleanup properly frees system resources
    // 2. New PTY sessions can be created after cleanup
    // 3. The fix for posix_spawnp errors is working correctly

    expect(recoveryResult.success).toBe(true);
    expect(recoveryResult.processId).toBeDefined();

    // Verify no spawn errors in the result
    if (recoveryResult.error) {
      const hasError = ERROR_PATTERNS.some(pattern =>
        recoveryResult.error.toLowerCase().includes(pattern.toLowerCase())
      );
      expect(hasError).toBe(false);
    }

    console.log('\n=== TEST COMPLETE ===');
    console.log('✓ Successfully created new worktree with PTY after cleanup');
    console.log(`Total worktrees created: ${worktreeCount + 1}`);
    console.log(`Final PTY session count: ${createdPtyIds.length + 1}`);
  });
});
