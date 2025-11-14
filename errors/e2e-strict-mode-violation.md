# E2E Test Error: Strict Mode Violation

## Test Information
- **Test File**: `e2e/project-switch-scheduler-persist.spec.ts:78:7`
- **Test Name**: Project Switch Scheduler Persistence Test › should persist scheduler when switching between projects
- **Error Line**: 152:28
- **Job ID**: 55286431957
- **Run ID**: 19328786016
- **Branch**: fix-switching-project-clearing-scheduler

## Error Summary
The test fails with a Playwright strict mode violation when trying to click the "Add Project" button. The locator resolves to 2 elements instead of 1, causing the test to fail.

## Error Details

```
Error: locator.click: Error: strict mode violation:
locator('button[title="Add Project"]').or(locator('button').filter({ has: locator('svg.lucide-plus') }))
resolved to 2 elements
```

### Elements Found:
1. Button with class `h-8 w-8` (8x8 pixels)
2. Button with class `h-10 w-10` (10x10 pixels) located in the Worktrees section

### Failing Code (Line 152):
```typescript
const addProjectButton = page.locator('button[title="Add Project"]')
  .or(page.locator('button').filter({ has: page.locator('svg.lucide-plus') }));
await setNextDialogPath(dummyRepoPath2);
await addProjectButton.click(); // FAILS HERE
```

## Root Cause
The current locator strategy is too broad and matches multiple buttons:
1. There are now multiple buttons with `title="Add Project"` OR buttons containing a plus icon
2. The Worktrees panel likely has its own "Add" button with a plus icon
3. The main project selector also has an "Add Project" button

The locator needs to be more specific to target only the main "Add Project" button in the project selector area, not the one in the Worktrees panel.

## Fix Strategy
Make the locator more specific by:
1. Adding a more specific parent container selector (e.g., project selector area)
2. Using a more specific combination of attributes
3. Filtering out the Worktrees panel button explicitly
4. Using `first()` if we always want the first matching button
5. Using a data-testid attribute for more reliable selection (best practice)

## Suggested Fix
```typescript
// Option 1: Be more specific about location
const addProjectButton = page
  .locator('[data-testid="project-selector"]') // or similar container
  .locator('button[title="Add Project"]');

// Option 2: Use first() if order is consistent
const addProjectButton = page
  .locator('button[title="Add Project"]')
  .first();

// Option 3: Filter by NOT being in worktrees panel
const addProjectButton = page
  .locator('button[title="Add Project"]')
  .filter({ hasNot: page.locator('div:has-text("Worktrees")') })
  .first();
```

## Impact
- Test fails 3 times (initial + 2 retries)
- Blocks the E2E test suite from passing
- Prevents CI pipeline from succeeding
