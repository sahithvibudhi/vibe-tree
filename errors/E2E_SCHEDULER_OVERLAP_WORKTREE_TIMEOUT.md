# E2E Scheduler Overlap Worktree Button Timeout

## Test Names
1. `terminal-scheduler-overlap.spec.ts:200:7` - "should show clean output when interval is longer than typing time"
2. `terminal-scheduler-overlap.spec.ts:273:7` - "should prevent corruption even with very short interval (200ms)"

## Error
```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('button[data-worktree-branch="main"]')
```

Both tests fail at the same location when trying to click the worktree button:
- Line 227: `await worktreeButton.click();` (test 2)
- Line 305: `await worktreeButton.click();` (test 3)

## Root Cause
The worktree button with `data-worktree-branch="main"` is not appearing within 30 seconds. This is likely because:

1. The project opening step is not completing properly in CI environment
2. There might be a timing issue where the app needs more time to load the worktree list
3. The first test (line 86) passes successfully, but tests 2 and 3 fail at the same step

## Test File Location
`apps/desktop/e2e/terminal-scheduler-overlap.spec.ts`

## Investigation Needed
- Check why the first test passes but subsequent tests fail
- Verify if there's test isolation issue (cleanup between tests)
- Check if project loading is slower in CI
- Investigate if the 3-second wait after `openButton.click()` is insufficient

## Fix Applied
Added proper waits and checks before clicking worktree button in tests 2 and 3:

1. **Test 2 (line 200):** Added `await expect(openButton).toBeVisible()` before clicking
2. **Test 2 (line 227-230):** Added worktree count check before clicking worktree button
3. **Test 3 (line 290):** Added `await expect(openButton).toBeVisible()` before clicking
4. **Test 3 (line 308-311):** Added worktree count check before clicking worktree button

These changes match the pattern used in test 1 which was passing. The tests now:
- Explicitly wait for the open button to be visible before clicking
- Verify worktree button exists (count > 0) before attempting to click
- Properly sequence: openButton.click() → wait 3s → check worktree exists → click worktree
