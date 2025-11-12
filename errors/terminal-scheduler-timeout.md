# Terminal Scheduler Test Timeout

## Test Information
- **File**: `apps/desktop/e2e/terminal-scheduler.spec.ts:179:7`
- **Test Name**: "Terminal Scheduler Test › should schedule repeating command and allow stopping"
- **Branch**: `indicate-scheduler-in-worktree-list`
- **CI Run**: 19260286915 (Job ID: 55063312687)
- **Date**: 2025-11-11

## Error Description

Test times out after 60 seconds during the `afterEach` hook when attempting to close the Electron app. The test fails consistently across all 3 retry attempts.

## Error Details

```
Test timeout of 60000ms exceeded while running "afterEach" hook.

  58 |   }, 45000);
  59 |
> 60 |   test.afterEach(async () => {
     |        ^
  61 |     if (electronApp) {
  62 |       await closeElectronApp(electronApp);
  63 |     }
```

## Additional Context

- Test runs for 2 minutes (120 seconds) before timing out
- Worker teardown timeout also exceeded (60000ms)
- Multiple retry attempts all fail with the same timeout
- The app seems to hang during cleanup, specifically in the `closeElectronApp` call

## Root Cause Analysis

The scheduler test likely starts a repeating command/process that doesn't get properly stopped before the test attempts to close the app. This causes the Electron app to hang during shutdown because:

1. The scheduler may still have active PTY processes or timers running
2. The app refuses to close while background tasks are active
3. The `closeElectronApp` helper waits indefinitely for a clean shutdown

## Proposed Solution

1. Skip this test temporarily to unblock CI (similar to other PTY-related tests)
2. Investigate the scheduler cleanup logic to ensure all timers and processes are properly stopped
3. Add explicit cleanup in the test before attempting to close the app
4. Consider adding a force-quit timeout to the closeElectronApp helper

## Status
- [ ] Error documented
- [ ] Test skipped to unblock CI
- [ ] Root cause investigated
- [ ] Permanent fix implemented
