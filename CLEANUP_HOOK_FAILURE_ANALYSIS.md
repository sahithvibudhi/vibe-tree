# Cleanup Hook Failure Analysis

## Issue Summary

After implementing a cleanup useEffect hook to fix the worker teardown timeout, **ALL 5 builds (9-13) failed with 100% failure rate** due to breaking the scheduler persistence feature.

## Test Results

| Build # | Run ID | Result | Error |
|---------|--------|--------|-------|
| 9 | 19361655154 | ❌ FAILED | project-switch-scheduler-persist.spec.ts:181 - Scheduler button missing blue class |
| 10 | 19361662368 | ❌ FAILED | project-switch-scheduler-persist.spec.ts:181 - Scheduler button missing blue class |
| 11 | 19361666122 | ❌ FAILED | project-switch-scheduler-persist.spec.ts:181 - Scheduler button missing blue class |
| 12 | 19361668770 | ❌ FAILED | project-switch-scheduler-persist.spec.ts:181 - Scheduler button missing blue class |
| 13 | 19361671661 | ❌ FAILED | project-switch-scheduler-persist.spec.ts:181 - Scheduler button missing blue class |

**Failure Pattern**: All 5 builds failed at the same test line:
```
Error: expect(locator).toHaveClass failed
Locator: locator('button[title="Schedule Command"]').first()
Expected pattern: /text-blue-500/
Received string: "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 w-10"
```

## Root Cause Analysis

### The Problematic Fix (Commit bc7cd751)

Added cleanup useEffect hook:
```typescript
useEffect(() => {
  return () => {
    const state = getSchedulerState();
    if (state?.timeoutId) {
      clearTimeout(state?.timeoutId);
    }
    updateSchedulerState(state ? { ...state, isRunning: false } : null);
  };
}, [getSchedulerState, updateSchedulerState]);
```

### Why It Fails

1. **Scheduler persistence design**: The scheduler uses a cache (`schedulerStateCache`) that persists across project switches
2. **Component lifecycle**: When switching projects, the `ClaudeTerminal` component unmounts
3. **Cleanup runs prematurely**: The cleanup hook runs on unmount, stopping the scheduler
4. **Test expectation broken**: Test expects scheduler to still be running after switching back to project 1

### The Conflict

The fix was designed to:
- ✅ Clean up pending promises during Playwright worker teardown
- ❌ But also cleans up during normal project switches (unintended side effect)

The scheduler feature was designed to:
- ✅ Persist across project switches using cache
- ❌ But now gets stopped by cleanup hook on every project switch

## Solution

The cleanup hook needs to distinguish between:
1. **Normal project switch** - Scheduler should persist (do NOT cleanup)
2. **Playwright worker teardown** - Scheduler should cleanup (do cleanup)

### Implementation Options

**Option 1: Remove cleanup hook, rely on Playwright's cleanup**
- Let Playwright handle worker teardown naturally
- Risk: May reintroduce worker teardown timeout (original issue)

**Option 2: Only cleanup on window unload in test environment**
- Add window.addEventListener('beforeunload', cleanup) only in test mode
- Preserves scheduler persistence during normal operation

**Option 3: Use a ref to track component mount state**
- Don't cleanup if component is just re-mounting with same project
- More complex but more precise

**Option 4: Remove cleanup entirely and fix the root cause differently**
- The original issue was floating promises preventing worker teardown
- Perhaps the fix in commit 8cdbad54 (return scheduleNext()) is sufficient
- The cleanup hook may be unnecessary if promise chains are properly managed

## Recommended Approach

**Remove the cleanup hook entirely** and verify that the original fix (commit 8cdbad54) alone is sufficient. The reasoning:

1. Commit 8cdbad54 changed `void scheduleNext()` to `return scheduleNext()` on line 213
2. This ensures the promise chain is properly tracked
3. Line 221 still uses `void scheduleNext()` to fire-and-forget the initial start
4. When component unmounts, React should handle cleanup of any in-flight promises
5. The cleanup hook was overly aggressive and broke the persistence feature

If removing the cleanup hook causes worker teardown timeouts again, we'll need a more sophisticated approach.

## Timeline

- **Commit 7b1e53b6**: Introduced worker teardown timeout (100% failure)
- **Commit 8cdbad54**: Partial fix - reduced to 50% failure rate
- **Commit bc7cd751**: Added cleanup hook - 100% failure with different error
- **Next**: Remove cleanup hook, test if original fix is sufficient

## Related Files

- `apps/desktop/src/renderer/components/ClaudeTerminal.tsx:244-256` (problematic cleanup hook)
- `apps/desktop/e2e/project-switch-scheduler-persist.spec.ts:181` (failing test)
- `WORKER_TEARDOWN_ANALYSIS.md` (previous failure analysis)
