# Terminal Scheduler Overlap Test Timeout

## Test Name
`terminal-scheduler-overlap.spec.ts:86:7 › Terminal Scheduler Overlap Fix Verification › should prevent overlapping execution even with fast repeat interval`

## Error
```
Test timeout of 120000ms exceeded.
Test timeout of 120000ms exceeded while running "afterEach" hook.
Worker teardown timeout of 60000ms exceeded.
```

## Details
- **Location**: `apps/desktop/e2e/terminal-scheduler-overlap.spec.ts:70:8`
- **Hook**: `afterEach` hook
- **Action**: `closeElectronApp(electronApp)`
- **Test Duration**: 4.0 minutes (timeout at 2 minutes)
- **Retry**: Failed on both initial run and retry #1

## Root Cause
The test is hanging during the `afterEach` cleanup hook when trying to close the Electron app. This suggests:

1. The Electron app process is not responding to the close signal
2. There may be active processes or timers preventing graceful shutdown
3. The scheduler might be keeping the app alive with pending executions
4. The test itself may be taking too long (ran for 4 minutes before timeout)

## Additional Context
- The test creates a dummy repo at `/tmp/dummy-repo-overlap-*`
- Worker teardown also times out after 60 seconds
- This test is specifically for verifying scheduler overlap prevention
- The test timeout is set to 120000ms (2 minutes) but the test runs for 4 minutes

## Proposed Fix
1. Increase the test timeout to accommodate the full test execution time
2. Ensure all scheduler instances are properly cleaned up before app closure
3. Add explicit cleanup of any running processes or timers
4. Consider adding a force-quit mechanism if graceful shutdown fails
