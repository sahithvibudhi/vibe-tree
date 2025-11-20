# E2E Tests Hanging During Execution

## Job
E2E Tests (Job ID: 55890809377)

## Tests Affected
- `e2e/final-test.spec.ts:40` - "should launch and display project selector" - Timed out after 2.0m (all 3 attempts)
- `e2e/final-test.spec.ts:59` - "should trigger file dialog when clicking open project folder" - Timed out after 2.0m (2 attempts)

## Error Pattern
```
✘ [electron] › e2e/final-test.spec.ts:40:7 › VibeTree Desktop App › should launch and display project selector (2.0m)
Worker teardown timeout of 120000ms exceeded.
```

## Root Cause
After adding timeout protection to `closeElectronApp()` in commit 79f2ebb0, the E2E tests started hanging during execution:

**Before changes (commit b652f40b):**
- Tests passed in <5 seconds
- Only issue was worker teardown timeout AFTER all tests completed

**After changes (commit 79f2ebb0):**
- Tests timeout after 2 minutes during execution
- Worker teardown also times out
- Only 2 smoke tests pass, then all subsequent tests hang

The problematic change was wrapping the `electronApp.evaluate()` call in `Promise.race()` with a 5-second timeout, then calling `electronApp.close()` in the catch block. This appears to interfere with normal test execution.

## Additional Issues
1. `workerTeardownTimeout: 30000` in playwright.config.ts is NOT being applied - still seeing 120s timeouts
2. This setting may not be supported in the current Playwright version

## Solution
Revert the timeout protection changes in `closeElectronApp()` and investigate alternative solutions for the worker teardown timeout that don't interfere with test execution.
