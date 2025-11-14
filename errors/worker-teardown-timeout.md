# E2E Build Error: Worker Teardown Timeout

## Error Information
- **Job ID**: 55363823904
- **Run ID**: 19351427120
- **Branch**: fix-switching-project-clearing-scheduler
- **Commit**: fe598287 (merge commit with main)

## Error Summary
The E2E test suite completed successfully with all 45 tests passing, but the Playwright worker process failed to teardown within the 60-second timeout, causing the build to fail.

## Error Details

```
[31mWorker teardown timeout of 60000ms exceeded.[39m
  45 passed (8.7m)
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test --reporter=list
```

### Test Results:
- **Total Tests**: 45
- **Passed**: 45
- **Failed**: 0
- **Test Duration**: 8.7 minutes
- **Teardown Timeout**: 60 seconds (exceeded)

## Root Cause
After all E2E tests completed successfully, the Playwright worker process took longer than 60 seconds to clean up and terminate. This is a teardown/cleanup issue, not a test failure.

Possible causes:
1. **PTY process cleanup delays**: The stress tests create many PTY sessions (47+ in one test), and cleanup may be slow
2. **Electron app not closing cleanly**: The Electron app instances may not be terminating properly
3. **Resource cleanup backlog**: Multiple worktrees, terminals, and processes created during tests may take time to clean up
4. **File descriptor cleanup**: Tests hit PTY limits (posix_spawnp errors) which may leave resources in limbo

## Context
This occurred after merging `origin/main` which included:
- Concurrency prevention changes (`commandInProgressRef`)
- Async `stopScheduler` with wait loops
- Extended diagnostics functionality

The merge combined:
- **Our branch**: Cache-based scheduler state management refactoring
- **Main**: Concurrency prevention and async cleanup improvements

## Potential Solutions

### Option 1: Increase worker teardown timeout
```typescript
// playwright.config.ts
export default {
  workers: process.env.CI ? 1 : undefined,
  timeout: 30000,
  expect: { timeout: 10000 },
  use: {
    // Increase worker teardown timeout
    workerOptions: {
      timeout: 120000 // 2 minutes instead of 60 seconds
    }
  }
}
```

### Option 2: Improve test cleanup
Ensure each test properly cleans up:
- Terminate all PTY processes
- Close all Electron windows
- Wait for async cleanup to complete
- Clear all timers and intervals

### Option 3: Add explicit global teardown
```typescript
// global-teardown.ts
export default async function globalTeardown() {
  // Force cleanup of any lingering resources
  // Kill any remaining Electron processes
  // Clean up temp directories
}
```

### Option 4: Reduce PTY stress test load
The `worktree-posix-spawnp-stress-test.spec.ts` creates 47+ PTY sessions which may be causing cleanup delays. Consider:
- Reducing the number of PTY sessions created
- Adding explicit cleanup between worktrees
- Increasing wait times for PTY termination

## Impact
- Build fails despite all tests passing
- Blocks CI/CD pipeline
- False negative in automated testing

## Next Steps
1. Check if this is reproducible locally
2. Review Playwright worker logs for more details
3. Investigate PTY cleanup timing in stress tests
4. Consider increasing worker teardown timeout as quick fix
5. Improve cleanup logic for long-term solution
