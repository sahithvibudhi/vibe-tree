# Round 4 Failure Analysis - AbortController Implementation Flaw

## Issue Summary

The AbortController approach (commit 9576a063) resulted in **100% failure rate** (5 out of 5 builds failed) with the scheduler persistence test failing.

## Test Results

| Build # | Run ID | Result | Error |
|---------|--------|--------|-------|
| 19 | 19383355811 | ❌ FAILED | expect(locator).toHaveClass failed - scheduler not running |
| 20 | 19383357095 | ❌ FAILED | expect(locator).toHaveClass failed - scheduler not running |
| 21 | 19383358068 | ❌ FAILED | expect(locator).toHaveClass failed - scheduler not running |
| 22 | 19383359359 | ❌ FAILED | expect(locator).toHaveClass failed - scheduler not running |
| 23 | 19383360603 | ❌ FAILED | expect(locator).toHaveClass failed - scheduler not running |

**Failure Pattern**: Same as Round 2 (commit bc7cd751) - scheduler persistence test fails at line 181

```
Error: expect(locator).toHaveClass failed
Expected pattern: /text-blue-500/
```

## Root Cause Analysis

### The Flaw in AbortController Approach

The implementation had a critical flaw:

```typescript
// Created once on component mount
const schedulerAbortControllerRef = useRef<AbortController>(new AbortController());

useEffect(() => {
  return () => {
    // Aborts the controller on unmount
    schedulerAbortControllerRef.current.abort();
  };
}, []); // Empty array - runs on mount/unmount
```

**The Problem**:
1. Component mounts → AbortController created (signal.aborted = false)
2. Component unmounts (project switch) → signal.aborted = true
3. Component remounts (switch back to project 1) → **SAME AbortController instance** (signal.aborted is STILL true!)
4. Scheduler tries to run but immediately returns because signal is aborted
5. Test fails because scheduler isn't running

### Why This Happens

React refs persist across unmount/remount cycles when using the same component instance. The `useRef` initialization only runs ONCE per component instance, not on every mount.

When switching projects:
- Project 1 → ClaudeTerminal unmounts (AbortController.abort() called)
- Project 2 → Different ClaudeTerminal mounts (new AbortController)
- Switch back to Project 1 → Same ClaudeTerminal remounts (SAME aborted AbortController!)

## Solution Options

### Option 1: Reset AbortController on Mount
```typescript
useEffect(() => {
  // Reset AbortController on mount
  schedulerAbortControllerRef.current = new AbortController();

  return () => {
    schedulerAbortControllerRef.current.abort();
  };
}, []);
```
**Pros**: Simple fix
**Cons**: Still runs cleanup on project switch (undesired)

### Option 2: Track Component Mounting State
```typescript
const isMountedRef = useRef(true);

useEffect(() => {
  isMountedRef.current = true;
  return () => {
    isMountedRef.current = false;
  };
}, []);

// In scheduleNext:
if (!isMountedRef.current) {
  return; // Component unmounted
}
```
**Pros**: More explicit
**Cons**: Similar issue - ref persists across remounts

### Option 3: Use stopScheduler() Mechanism Only
```typescript
// Don't use AbortController at all
// Rely on stopScheduler() setting isRunning = false

// The scheduler already checks getSchedulerState()?.isRunning
// This naturally handles cleanup through the cache
```
**Pros**: Uses existing mechanism, no new state to manage
**Cons**: Doesn't solve the worker teardown timeout

### Option 4: Window/Process Unload Event
```typescript
useEffect(() => {
  const handleUnload = () => {
    // Only runs on actual window close, not component unmount
    schedulerAbortControllerRef.current.abort();
  };

  window.addEventListener('beforeunload', handleUnload);
  return () => {
    window.removeEventListener('beforeunload', handleUnload);
  };
}, []);
```
**Pros**: Only cleans up on actual window close
**Cons**: May not fire during Playwright test teardown

### Option 5: Test Environment Detection + Cleanup
```typescript
useEffect(() => {
  // Only cleanup in test environment
  if (process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT) {
    return () => {
      schedulerAbortControllerRef.current.abort();
    };
  }
}, []);
```
**Pros**: Preserves normal app behavior, only affects tests
**Cons**: Hacky, relies on environment detection

## Recommended Approach

**Combination of Option 1 + Option 4**: Reset AbortController on mount AND use window unload for cleanup

```typescript
useEffect(() => {
  // Reset on each mount to handle project switches
  schedulerAbortControllerRef.current = new AbortController();

  const handleUnload = () => {
    // Cleanup on window close/Playwright teardown
    schedulerAbortControllerRef.current.abort();
  };

  window.addEventListener('beforeunload', handleUnload);

  return () => {
    window.removeEventListener('beforeunload', handleUnload);
  };
}, []);
```

This approach:
- ✅ Resets AbortController on each mount (fixes persistence issue)
- ✅ Cleans up on window close (handles Playwright teardown)
- ✅ Doesn't interfere with project switches
- ✅ No environment detection needed

## Timeline

- **Commit 7b1e53b6**: Worker teardown timeout (100% failure)
- **Commit 8cdbad54**: Partial fix (50% failure)
- **Commit bc7cd751**: Cleanup hook (100% failure - scheduler persistence broken)
- **Commit ddbf2b5c**: Removed cleanup (40% failure - worker teardown returns)
- **Commit 9576a063**: AbortController (100% failure - same as bc7cd751)
- **Next**: Fix AbortController reset + window unload

## Related Files

- `apps/desktop/src/renderer/components/ClaudeTerminal.tsx:72` (AbortController ref)
- `apps/desktop/src/renderer/components/ClaudeTerminal.tsx:262-267` (cleanup effect)
- `apps/desktop/e2e/project-switch-scheduler-persist.spec.ts:181` (failing test)
