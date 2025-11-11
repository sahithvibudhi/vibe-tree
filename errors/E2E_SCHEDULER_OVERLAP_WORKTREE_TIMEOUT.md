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

## Potential Fixes
1. Add explicit wait for worktree button before clicking
2. Increase timeout for worktree button visibility check
3. Add better error handling to show what elements ARE present when timeout occurs
4. Check if project is fully loaded before attempting to click worktree button
