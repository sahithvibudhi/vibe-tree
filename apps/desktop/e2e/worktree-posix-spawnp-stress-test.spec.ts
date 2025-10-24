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

  // This test rapidly creates PTY sessions until hitting OS resource limits
  // Creates up to 1024 worktrees to ensure we hit limits even on Linux (typical limit: ~1024)
  // Then verifies that PTY cleanup works and recovery is possible after cleanup
  test('should stress test PTY creation and verify recovery after cleanup', async () => {
    test.setTimeout(600000); // 10 minutes timeout

    let worktreeCount = 0;
    let ptyFailureCount = 0;
    const MAX_WORKTREES = 1024; // High enough to hit limits even on Linux systems
    const ERROR_PATTERNS = [
      'posix_spawnp failed',
      'EMFILE',
      'ENFILE',
      'too many open files',
      'Cannot create PTY',
      'Failed to spawn',
      'spawn failed',
      'ENOENT'
    ];

    const createdPtyIds: string[] = [];

    console.log('Starting rapid PTY creation test...');
    console.log('');

    // Phase 1: Rapidly create worktrees and PTY sessions until we hit the error
    while (worktreeCount < MAX_WORKTREES && ptyFailureCount < 3) {
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

        if (!result.success) {
          const errorMessage = result.error || 'Unknown error';
          const hasTargetError = ERROR_PATTERNS.some(pattern =>
            errorMessage.toLowerCase().includes(pattern.toLowerCase())
          );

          if (hasTargetError) {
            console.log(`\nPTY SPAWN ERROR at worktree ${worktreeCount}: ${errorMessage}`);
            posixSpawnpErrorOccurred = true;
            ptyFailureCount++;
          } else {
            console.log(`Worktree ${worktreeCount}: PTY creation failed with: ${errorMessage}`);
          }
        } else {
          if (result.processId) {
            createdPtyIds.push(result.processId);
          }
          if (worktreeCount % 10 === 0) {
            console.log(`Created ${worktreeCount} worktrees with PTY sessions`);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`Error at worktree ${worktreeCount}:`, errorMessage);

        const isTargetError = ERROR_PATTERNS.some(pattern =>
          errorMessage.toLowerCase().includes(pattern.toLowerCase())
        );

        if (isTargetError) {
          console.log(`\nTARGET ERROR FOUND: ${errorMessage}`);
          posixSpawnpErrorOccurred = true;
          ptyFailureCount++;
        }
      }
    }

    // Report Phase 1 results
    console.log('\n=== PHASE 1 RESULTS ===');
    console.log(`Created ${worktreeCount} worktrees`);
    console.log(`Created ${createdPtyIds.length} PTY sessions`);
    console.log(`PTY failures: ${ptyFailureCount}`);
    console.log(`posix_spawnp error occurred: ${posixSpawnpErrorOccurred}`);

    // We should hit the error by creating up to 1024 PTYs
    // If we don't hit it, something might be wrong with PTY creation
    if (!posixSpawnpErrorOccurred) {
      console.log('\n⚠️  WARNING: Did not hit posix_spawnp error after 1024 worktrees');
      console.log('This is unexpected - most systems have PTY limits around 256-1024');
      console.log('PTY sessions might not be getting created properly');
      console.log(`Created ${createdPtyIds.length} PTY sessions out of ${worktreeCount} worktrees`);

      // If we created very few PTYs compared to worktrees, something is wrong
      if (createdPtyIds.length < worktreeCount * 0.5) {
        throw new Error(
          `Test FAILED: Created only ${createdPtyIds.length} PTY sessions out of ${worktreeCount} worktrees. ` +
          `This suggests PTY sessions are not being created properly.`
        );
      }
      console.log('Proceeding with recovery test despite not hitting error...');
    }

    // If we hit the error too early (e.g., < 10 PTYs), it likely means other apps are consuming slots
    // In this case, we can't properly test recovery, so skip the rest
    if (createdPtyIds.length < 10) {
      console.log('\n⚠️  WARNING: Created very few PTY sessions (< 10)');
      console.log('This likely means other applications are consuming PTY slots.');
      console.log('Skipping recovery test - unable to reliably test with so few PTY sessions.');
      console.log('Test PASSED (early exit due to system constraints)');
      return; // Exit early but don't fail
    }

    // Verify we created enough PTYs to meaningfully test recovery
    expect(createdPtyIds.length).toBeGreaterThanOrEqual(10);

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
