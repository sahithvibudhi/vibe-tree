# terminateSessionsForWorktree Returns Promise Instead of Number

## GitHub Actions Run
- Run ID: 18734732338
- Workflow: CI
- Branch: close-project-release-node-pty
- Failed Job: Unit Tests (Job ID: 53439019871)
- URL: https://github.com/sahithvibudhi/vibe-tree/actions/runs/18734732338/job/53439019871

## Summary
8 out of 8 tests failed in `ShellSessionManager.test.ts` because `terminateSessionsForWorktree()` is returning a Promise instead of a number synchronously.

## Failed Tests

### 1. should kill all PTY processes for a specific worktree path
- **Location**: `src/services/ShellSessionManager.test.ts:102`
- **Error**: `expected Promise{…} to be 2 // Object.is equality`
- **Expected**: 2
- **Received**: Promise {}

### 2. should return 0 when no sessions exist for the worktree
- **Location**: `src/services/ShellSessionManager.test.ts:124`
- **Error**: `expected Promise{…} to be +0 // Object.is equality`
- **Expected**: 0
- **Received**: Promise {}

### 3. should handle multiple sessions with the same worktree path
- **Location**: `src/services/ShellSessionManager.test.ts:157`
- **Error**: `expected Promise{…} to be 5 // Object.is equality`
- **Expected**: 5
- **Received**: Promise {}

### 4. should clean up listeners and disposables when terminating sessions
- **Location**: `src/services/ShellSessionManager.test.ts:202`
- **Error**: `expected Promise{…} to be 1 // Object.is equality`
- **Expected**: 1
- **Received**: Promise {}

### 5. should not affect sessions from other worktrees when terminating
- **Location**: `src/services/ShellSessionManager.test.ts:242`
- **Error**: `expected Promise{…} to be 1 // Object.is equality`
- **Expected**: 1
- **Received**: Promise {}

### 6. should handle case where worktree path is empty string
- **Location**: `src/services/ShellSessionManager.test.ts:261`
- **Error**: `expected Promise{…} to be +0 // Object.is equality`
- **Expected**: 0
- **Received**: Promise {}

### 7. should handle exact path matching (no partial matches)
- **Location**: `src/services/ShellSessionManager.test.ts:282`
- **Error**: `expected Promise{…} to be 1 // Object.is equality`
- **Expected**: 1
- **Received**: Promise {}

### 8. should terminate all sessions regardless of worktree (cleanup test)
- **Location**: `src/services/ShellSessionManager.test.ts:318`
- **Error**: `expected 2 to be +0 // Object.is equality`
- **Expected**: 0
- **Received**: 2
- **Note**: This test has a different error pattern - sessions weren't cleaned up

## Root Cause

The `terminateSessionsForWorktree()` method in `ShellSessionManager.ts` is likely calling `terminateSession()` which is an async method, and the map operation is returning an array of Promises instead of awaiting them properly.

Looking at the test code:
```typescript
const terminatedCount = manager.terminateSessionsForWorktree(worktreePath1);
expect(terminatedCount).toBe(2);
```

The method is being called without `await`, suggesting it should be synchronous, but it's returning a Promise.

## Fix Strategy

1. Check `ShellSessionManager.ts` implementation of `terminateSessionsForWorktree()`
2. Either:
   - Option A: Make the method properly synchronous if termination doesn't need to be awaited
   - Option B: Make the method async and update all call sites to use `await`
   - Option C: Change `terminateSession()` to be synchronous and just initiate cleanup without waiting

3. The tests expect synchronous behavior, so Option A or C is likely preferred
4. The method should return a number (count of terminated sessions) immediately

## Additional Notes

- The logs show "Could not kill process group -XXXX, falling back to PTY process: Error: kill ESRCH" - this is expected behavior when process groups don't exist (not an error that causes test failure)
- The actual PTY killing works ("PTY process XXXX force killed", "Successfully terminated session...")
- The issue is purely about return value synchronicity
