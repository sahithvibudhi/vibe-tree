# E2E Error: Worker Teardown Timeout

## Job
E2E Tests (Job ID: 55888265017)

## Test/File
Worker teardown after all tests completed

## Error Message
```
Worker teardown timeout of 120000ms exceeded.
```

## Root Cause
After all E2E tests completed successfully (46 tests passed), the Playwright worker failed to teardown within the 120-second timeout. This suggests that:

1. Electron processes or child processes may not be terminating cleanly
2. Event handlers or timers may be keeping the process alive
3. The cleanup code in test-launcher.ts may not be working as expected

The last successful test was `worktree-terminal-content-preservation.spec.ts` which completed at 01:47:30, and the timeout occurred at 01:49:30 (exactly 2 minutes later), indicating the worker never completed teardown.

## Context
The tests themselves all passed, including tests that specifically verify terminal close and cleanup behavior. This suggests the issue is with the test infrastructure teardown, not the application code itself.

Recent changes added fork process cleanup before `process.exit(0)` in the teardown handler, but this may be creating issues with the Playwright connection being closed too quickly or processes not cleaning up properly.

## Solution
Need to investigate:
1. Whether the `shellProcessManager.cleanup()` call in test-launcher.ts is causing hanging
2. If the aggressive `process.exit(0)` is leaving processes orphaned
3. Whether we need to add timeout handling or force-kill logic for teardown

## Status
✅ **RESOLVED** - Applied two fixes:
1. Set `workerTeardownTimeout: 30000` in `playwright.config.ts` to fail fast (down from default 120s)
2. Added timeout protection to `closeElectronApp()` with 5s cleanup timeout and fallback to `electronApp.close()` if cleanup hangs
