# Terminal Scheduler Overlap Test Timeout

## Test Information
- **Test File**: `e2e/terminal-scheduler-overlap.spec.ts:86:7`
- **Test Name**: Terminal Scheduler Overlap Fix Verification › should prevent overlapping execution even with fast repeat interval
- **Job ID**: 55286772298
- **Run ID**: 19328889080

## Error Summary
The test consistently times out after 4 minutes (240 seconds) in both the initial run and retry. The test has a timeout of 120,000ms (2 minutes) but is exceeded. Additionally, there's a worker teardown timeout of 60 seconds that is also exceeded.

## Error Details

```
Test timeout of 120000ms exceeded.
Test timeout of 120000ms exceeded while running "afterEach" hook.

Worker teardown timeout of 60000ms exceeded.
```

## Timeline
1. Test starts at line 86
2. Test runs for 4 minutes (240s) - far exceeding the 120s timeout
3. Test times out during the test execution itself
4. afterEach hook at line 70 cannot complete (tries to close Electron app)
5. Worker teardown also times out after 60s
6. Test is retried (retry #1) with same result

## Root Cause Analysis

The test appears to be hanging during execution or cleanup. Possible causes:

1. **Electron app not responding**: The app may be in a hung state, preventing the test from completing
2. **afterEach cleanup hanging**: The `closeElectronApp(electronApp)` call at line 72 is not completing, suggesting:
   - Electron process not terminating properly
   - PTY processes or schedulers still running and preventing clean shutdown
   - File descriptor exhaustion (ulimit is set to 128 in CI)
3. **Scheduler not stopping**: The test involves a scheduler with a fast repeat interval - the scheduler may not be stopping properly
4. **Resource cleanup issue**: Given the file descriptor limit of 128, the test may be exhausting resources

## Test Context
- Test creates a dummy repo at `/tmp/dummy-repo-overlap-<timestamp>`
- Test involves terminal scheduler with fast repeat interval
- Test runs with ulimit -n 128 (file descriptor limit)
- Test uses xvfb for headless execution
- Test timeout set to 45,000ms in the test, but experiencing 4-minute hangs

## Related Code
- Line 70-73: afterEach hook that tries to close Electron app
- Line 86: The actual test that checks for overlapping execution prevention

## Impact
- Blocks 7 tests from running (marked as skipped)
- Prevents 24 tests from running (did not run)
- Causes CI pipeline to fail
- Takes significant CI time (>8 minutes including retry)

## Recommended Fix Strategy
1. Add explicit scheduler cleanup before closing app
2. Add timeout to the closeElectronApp function
3. Kill any lingering PTY processes before app close
4. Consider reducing test duration or repeat count
5. Add better error handling and logging to understand where the hang occurs
6. Ensure all schedulers are explicitly stopped in afterEach
