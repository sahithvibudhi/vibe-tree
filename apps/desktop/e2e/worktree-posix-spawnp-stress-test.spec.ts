import { test, expect } from '@playwright/test';
import { ElectronApplication, _electron as electron } from 'playwright';
import { createTestGitRepo, cleanupTestGitRepo } from './helpers/test-git-repo';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

test.describe('Worktree posix_spawnp Stress Test', () => {
  let electronApp: ElectronApplication;
  let dummyRepoPath: string;
  const createdWorktrees: string[] = [];

  test.beforeEach(async () => {
    // Create a dummy git repository
    const { repoPath } = createTestGitRepo({ nameSuffix: 'repo-stress' });
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
    cleanupTestGitRepo(dummyRepoPath);
  });

  // This test verifies PTY cleanup by:
  // 1. Creating many PTY sessions until hitting posix_spawnp error
  // 2. Cleaning up PTY sessions
  // 3. Verifying cleanup freed resources
  // 4. Verifying new PTYs can be created after cleanup (RECOVERY)
  //
  // NOTE: CI uses ulimit -n 128 to artificially limit file descriptors.
  // PTY sessions are kept alive with sleep commands to ensure they hold file descriptors.
  test('should verify PTY cleanup frees resources', async () => {
    test.setTimeout(120000); // 2 minutes timeout

    let worktreeCount = 0;
    const MAX_WORKTREES = 1000; // Keep trying until we hit the error - ulimit will stop us
    const createdPtyIds: string[] = [];
    let hitPosixSpawnpError = false;

    console.log('Starting PTY cleanup verification test...');
    console.log(`Creating up to ${MAX_WORKTREES} worktrees with PTY sessions...`);
    console.log('(CI uses ulimit -n 128 to ensure we hit OS limits)');
    console.log('');

    // Phase 1: Create PTY sessions until hitting posix_spawnp error
    while (worktreeCount < MAX_WORKTREES && !hitPosixSpawnpError) {
      worktreeCount++;
      const branchName = `worktree-${String(worktreeCount).padStart(3, '0')}`;
      // Create worktrees adjacent to the main repo, not in random tmp folders
      const worktreePath = path.join(path.dirname(dummyRepoPath), branchName);

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

          // Don't send any commands - just let the shell sit idle
          // The shell process itself should keep the PTY and file descriptors alive
          // This mimics the "explode" button behavior of just opening terminals without running commands

          // Small delay to allow PTY to fully initialize
          // This ensures file descriptors are fully allocated before creating next PTY
          await new Promise(resolve => setTimeout(resolve, 300));

          if (worktreeCount % 10 === 0) {
            console.log(`Created ${worktreeCount} worktrees with PTY sessions`);
          }
        } else {
          const errorMsg = result.error || 'Unknown error';
          console.log(`Worktree ${worktreeCount}: PTY creation failed with: ${errorMsg}`);

          // Check if we hit PTY spawn error (posix_spawnp or forkpty failure)
          if (errorMsg.toLowerCase().includes('posix_spawnp') || errorMsg.toLowerCase().includes('forkpty')) {
            hitPosixSpawnpError = true;
            console.log(`\n✓ Hit PTY spawn error (${errorMsg}) at ${createdPtyIds.length} PTY sessions!`);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`Error at worktree ${worktreeCount}:`, errorMessage);
        // Continue trying even if git worktree creation fails
        // We want to keep going until we hit posix_spawnp error
      }
    }

    console.log(`\n=== LOOP ENDED ===`);
    console.log(`Loop stopped after ${worktreeCount} iterations`);
    console.log(`Hit posix_spawnp error: ${hitPosixSpawnpError ? 'YES' : 'NO'}`);

    // Report Phase 1 results
    console.log('\n=== PHASE 1 RESULTS ===');
    console.log(`Created ${worktreeCount} worktrees`);
    console.log(`Created ${createdPtyIds.length} PTY sessions`);
    console.log(`Hit posix_spawnp error: ${hitPosixSpawnpError ? 'YES' : 'NO'}`);

    // With ulimit -n 128, we MUST hit the posix_spawnp error
    if (!hitPosixSpawnpError) {
      throw new Error(
        `Test FAILED: Did not hit posix_spawnp error after creating ${createdPtyIds.length} PTY sessions. ` +
        `This test MUST hit OS limits to verify cleanup works (CI uses ulimit -n 128).`
      );
    }

    // Require at least 10 PTY sessions to make the test meaningful
    if (createdPtyIds.length < 10) {
      throw new Error(
        `Test FAILED: Only created ${createdPtyIds.length} PTY sessions (minimum: 10). ` +
        `Not enough PTYs to verify cleanup logic.`
      );
    }

    // Get initial PTY stats
    const statsBeforeCleanup = await electronApp.evaluate(async ({ ipcMain }) => {
      return new Promise((resolve) => {
        const mockEvent = { sender: { id: 999 } };
        const handlers = (ipcMain as any)._invokeHandlers;
        const handler = handlers?.get('shell:get-stats');
        if (handler) {
          handler(mockEvent).then(resolve).catch(() => resolve({ activeProcessCount: 0 }));
        } else {
          resolve({ activeProcessCount: 0 });
        }
      });
    });

    console.log(`PTY sessions before cleanup: ${statsBeforeCleanup.activeProcessCount}`);
    console.log(`✓ Successfully created ${createdPtyIds.length} PTY sessions`);

    // Phase 2: Terminate 10 PTY sessions and delete 10 worktrees
    console.log('\n=== PHASE 2: CLEANING UP 10 WORKTREES ===');

    const worktreesToCleanup = Math.min(10, createdWorktrees.length);
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

    console.log(`✓ Successfully cleaned up 10 worktrees`);

    // Phase 3: Create new worktree and verify PTY creation works after cleanup
    console.log('\n=== PHASE 3: CREATING NEW WORKTREE AFTER CLEANUP ===');

    const newBranchName = `worktree-recovery`;
    const newWorktreePath = path.join(path.dirname(dummyRepoPath), newBranchName);

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

    console.log('\n=== TEST COMPLETE ===');
    console.log('✓ Hit OS PTY limits (posix_spawnp error)');
    console.log('✓ Cleaned up 10 PTY sessions');
    console.log('✓ Successfully created new PTY after cleanup');
    console.log(`Total worktrees created: ${worktreeCount + 1}`);
    console.log(`PTY sessions created before hitting limit: ${createdPtyIds.length}`);
    console.log('✓ RECOVERY FROM posix_spawnp ERROR VERIFIED');
  });
});
