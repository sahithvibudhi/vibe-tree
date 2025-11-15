# Round 3 Failure Analysis - Worker Teardown Returns

## Issue Summary

After removing the cleanup hook (commit ddbf2b5c), the **worker teardown timeout returned with 40% failure rate** (2 out of 5 builds failed).

## Test Results

| Build # | Run ID | Result | Error |
|---------|--------|--------|-------|
| 14 | 19382324659 | ✅ SUCCESS | - |
| 15 | 19382325728 | ❌ FAILED | Worker teardown timeout of 60000ms exceeded |
| 16 | 19382327005 | ✅ SUCCESS | - |
| 17 | 19382328238 | ❌ FAILED | Worker teardown timeout of 60000ms exceeded |
| 18 | 19382330231 | ✅ SUCCESS | - |

**Failure Pattern**: All 45 tests pass, but worker teardown times out:
```
Worker teardown timeout of 60000ms exceeded.

45 passed (8.7m)
```

## Root Cause Analysis

### The Dilemma

We have two conflicting requirements:

1. **Scheduler Persistence**: The scheduler must persist when switching between projects
   - Required by: `project-switch-scheduler-persist.spec.ts:181`
   - Uses cache: `schedulerStateCache` to maintain state across component unmounts

2. **Worker Teardown Cleanup**: Pending scheduler promises must be cancelled during Playwright worker teardown
   - Required by: Playwright's 60-second worker teardown timeout
   - Without cleanup: Floating promises prevent worker from shutting down

### What We've Tried

**Attempt 1 (Commit 8cdbad54)**: Added `return scheduleNext()` to chain promises
- Result: 50% failure rate (4 out of 8 builds failed)
- Problem: No cleanup mechanism for pending promises

**Attempt 2 (Commit bc7cd751)**: Added cleanup useEffect hook
- Result: 100% failure rate with scheduler persistence test failing
- Problem: Hook runs on every component unmount, breaking persistence feature

**Attempt 3 (Commit ddbf2b5c)**: Removed cleanup hook
- Result: 40% failure rate (2 out of 5 builds failed)
- Problem: Worker teardown timeout returns (original issue)

### The Core Problem

The cleanup useEffect hook has these dependencies:
```typescript
useEffect(() => {
  return () => {
    // cleanup code
  };
}, [getSchedulerState, updateSchedulerState]);
```

These dependencies cause the cleanup to run:
- ✅ On component unmount (desired during worker teardown)
- ❌ On every render when dependencies change (undesired during normal operation)
- ❌ On project switch (undesired - breaks persistence)

## Solution Strategy

We need a cleanup mechanism that ONLY runs during Playwright worker teardown, not during normal application flow. Here are the options:

### Option 1: Empty Dependency Array
```typescript
useEffect(() => {
  return () => {
    // cleanup code using refs instead of state
  };
}, []); // Empty array - only runs on mount/unmount
```
**Pros**: Cleanup only runs on true unmount
**Cons**: Can't access latest state, need to use refs

### Option 2: Track Scheduler Promise Chain
```typescript
const schedulerPromiseRef = useRef<Promise<void> | null>(null);

const stopScheduler = async () => {
  if (schedulerPromiseRef.current) {
    await schedulerPromiseRef.current; // Wait for chain to complete
  }
  // Then stop
};
```
**Pros**: Explicit control over promise lifecycle
**Cons**: More complex implementation

### Option 3: Test Environment Detection
```typescript
useEffect(() => {
  return () => {
    // Only cleanup in test environment
    if (process.env.NODE_ENV === 'test') {
      // cleanup code
    }
  };
}, []);
```
**Pros**: Preserves normal app behavior
**Cons**: Hacky, relies on environment detection

### Option 4: AbortController Pattern
```typescript
const abortControllerRef = useRef<AbortController>(new AbortController());

const scheduleNext = async (): Promise<void> => {
  if (abortControllerRef.current.signal.aborted) {
    return; // Early exit if aborted
  }
  // ... rest of scheduler logic
};

useEffect(() => {
  return () => {
    abortControllerRef.current.abort(); // Signal all pending schedulers to stop
  };
}, []);
```
**Pros**: Standard pattern for cancellable async operations
**Cons**: Requires refactoring scheduler logic

## Recommended Approach

**Use Option 4 (AbortController)** with empty dependency array:

1. Create an `AbortController` in a ref (persists across renders)
2. Check `signal.aborted` in `scheduleNext` before continuing
3. Cleanup function calls `abort()` on unmount
4. Empty dependency array ensures cleanup only runs on true unmount

This approach:
- ✅ Allows scheduler to persist during project switches (cache still works)
- ✅ Cleanly cancels pending schedulers on component unmount
- ✅ Uses standard web API pattern
- ✅ No reliance on environment detection
- ✅ Explicit control over cancellation

## Timeline

- **Commit 7b1e53b6**: Introduced worker teardown timeout (100% failure)
- **Commit 8cdbad54**: Partial fix - reduced to 50% failure rate
- **Commit bc7cd751**: Added cleanup hook - 100% failure with scheduler persistence broken
- **Commit ddbf2b5c**: Removed cleanup hook - 40% failure rate (worker teardown returns)
- **Next**: Implement AbortController pattern with empty dependency array

## Related Files

- `apps/desktop/src/renderer/components/ClaudeTerminal.tsx:176-236` (scheduler implementation)
- `apps/desktop/e2e/project-switch-scheduler-persist.spec.ts:181` (persistence test)
- `WORKER_TEARDOWN_ANALYSIS.md` (round 1 analysis)
- `CLEANUP_HOOK_FAILURE_ANALYSIS.md` (round 2 analysis)
