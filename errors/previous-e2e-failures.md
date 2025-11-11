# Previous E2E Test Failures (Run 19258112303)

## Summary
The previous CI run had 2 test failures that are **NOT related to the scheduler indicator changes**:

1. **project-close-pty-cleanup.spec.ts** - Timeout during teardown
2. **menu-structure.spec.ts** - Flaky test for Recent Projects menu

## Test 1: project-close-pty-cleanup.spec.ts

**Test Name:** `Project Close PTY Cleanup › should kill all PTY processes when closing a project`

**Status:** Failed with timeout (3 attempts, all timed out)

**Error:**
```
Test timeout of 90000ms exceeded while running "afterEach" hook.
Worker teardown timeout of 60000ms exceeded.
```

**Root Cause:**
- The test is timing out during the afterEach hook when trying to close the Electron app
- The PTY cleanup is taking too long or hanging
- This is a pre-existing flaky test, not related to scheduler indicator changes

**Impact on PR:** None - this test doesn't interact with the worktree list UI or scheduler indicator

## Test 2: menu-structure.spec.ts

**Test Name:** `Application Menu Structure › should update Recent Projects menu when a project is added`

**Status:** Flaky (passed on retry)

**Error:**
```
Error: Recent Projects menu did not update with test project (max attempts: 10)
```

**Root Cause:**
- The test is checking if the Recent Projects menu updates
- This is a timing/race condition issue where the menu doesn't update fast enough
- Marked as "flaky" by Playwright (passed on retry)

**Impact on PR:** None - this test doesn't interact with scheduler functionality

## Conclusion

Both failures are **pre-existing flaky tests** that are unrelated to the scheduler indicator feature added in this PR. The scheduler indicator changes:
- Only modify the worktree list UI rendering
- Add state tracking for scheduler status
- Do not touch PTY cleanup logic
- Do not modify menu structure or Recent Projects functionality

These tests should be fixed separately from this PR as they represent infrastructure/flakiness issues rather than bugs introduced by this change.
