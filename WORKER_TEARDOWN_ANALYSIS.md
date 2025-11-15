# Worker Teardown Timeout Analysis

## Issue Summary

The Playwright E2E tests experience intermittent worker teardown timeouts with a **50% failure rate** (4 out of 8 builds failed).

## Test Results

| Build # | Run ID | Result | Error |
|---------|--------|--------|-------|
| 1 | 19360629808 | ❌ FAILED | Worker teardown timeout of 60000ms exceeded |
| 2 | 19360643915 | ✅ SUCCESS | - |
| 3 | 19360647684 | ✅ SUCCESS | - |
| 4 | 19361127587 | ❌ FAILED | Worker teardown timeout of 60000ms exceeded |
| 5 | 19361129813 | ✅ SUCCESS | - |
| 6 | 19361133154 | ❌ FAILED | Worker teardown timeout of 60000ms exceeded |
| 7 | 19361136288 | ✅ SUCCESS | - |
| 8 | 19361138643 | ❌ FAILED | Worker teardown timeout of 60000ms exceeded |

**Failure Pattern**: All 45 tests pass successfully, but then:
```
Worker teardown timeout of 60000ms exceeded.

Failed worker ran 45 tests, last 10 tests were:
...

45 passed (8.8m)
1 error was not a part of any test, see above for details
undefined
```

## Root Cause Analysis

### Previous Fix (Commit 8cdbad54)

The fix added `return scheduleNext()` on line 213 and `void scheduleNext()` on line 221. However, this only partially addressed the issue.

### Actual Problem

The scheduler's promise chain is not being properly cleaned up when the Playwright worker tears down. The issue is that:

1. **The `void` operator** on line 221 creates a floating promise that's intentionally not awaited
2. **Recursive promise chain** continues running even after tests complete
3. **No cleanup mechanism** exists to terminate pending scheduler promises when the worker shuts down
4. **Race condition**: Worker teardown begins while scheduler promises are still pending

### Why It's Intermittent (50% Failure Rate)

The failure depends on timing:
- **SUCCESS**: Scheduler promises complete naturally before worker teardown begins
- **FAILURE**: Worker teardown starts while scheduler promises are still pending, causing 60s timeout

## Solution

The scheduler needs a proper cleanup mechanism that:

1. Tracks the active scheduler promise chain
2. Provides a way to abort/cancel pending schedulers during cleanup
3. Ensures all promises resolve before worker teardown

### Implementation

Store the scheduler promise chain and cancel it during component unmount or worker teardown.

## Related Files

- `apps/desktop/src/renderer/components/ClaudeTerminal.tsx:176-236`
- `apps/desktop/playwright.config.ts:3-25`

## Timeline

- **Commit 7b1e53b6**: Introduced worker teardown timeout (100% failure)
- **Commit 8cdbad54**: Partial fix - reduced to 50% failure rate
- **Next**: Complete fix needed for 100% success rate
