# Flaky Test: Recent Projects Menu Update

## Test Information
- **Test File**: `apps/desktop/e2e/menu-structure.spec.ts:177:7`
- **Test Name**: "Application Menu Structure › should update Recent Projects menu when a project is added"
- **Status**: Flaky (failed on first run, passed on retry #1)
- **CI Run**: https://github.com/sahithvibudhi/vibe-tree/actions/runs/19289822602

## Error Details

```
Error: Recent Projects menu did not update with test project (max attempts: 25)

   at test-utils.ts:51

  49 |   }
  50 |
> 51 |   throw new Error(`${message} (max attempts: ${maxAttempts})`);
     |         ^
  52 | }
  53 |
    at waitUntil (/__w/vibe-tree/vibe-tree/apps/desktop/e2e/test-utils.ts:51:9)
    at /__w/vibe-tree/vibe-tree/apps/desktop/e2e/menu-structure.spec.ts:193:5
```

## Root Cause Analysis

The test is checking if the Recent Projects menu updates when a project is added. The test calls the `recent-projects:add` IPC handler and then waits for the menu to update.

**The root cause is that the menu is never rebuilt after adding a recent project.**

When `recentProjectsManager.addRecentProject()` is called:
1. It adds the project to the in-memory list
2. It saves to disk
3. **But it does NOT trigger a menu rebuild**

The menu is only built once at app startup via `createMenu(mainWindow)` in `apps/desktop/src/main/index.ts:74`.

Interestingly, when clearing recent projects (line 92 in menu.ts), the code DOES call `createMenu(mainWindow)` to rebuild the menu. This same pattern should be used when adding/removing recent projects.

## Fix

The IPC handlers in `apps/desktop/src/main/ipc-handlers.ts` need to rebuild the menu after modifying recent projects:

- Line 106-108: `recent-projects:add` handler needs to call `createMenu(mainWindow)` after adding
- Line 110-112: `recent-projects:remove` handler needs to call `createMenu(mainWindow)` after removing
- Line 114-116: `recent-projects:clear` handler - already handled in menu.ts but could be done here too

## Implementation

Fixed in `apps/desktop/src/main/ipc-handlers.ts`:
1. Added import for `createMenu` from './menu'
2. Updated `recent-projects:add` handler to call `createMenu(mainWindow)` after adding project
3. Updated `recent-projects:remove` handler to call `createMenu(mainWindow)` after removing project
4. Updated `recent-projects:clear` handler to call `createMenu(mainWindow)` after clearing (for consistency)

## Testing

Run the specific flaky test locally:
```bash
cd apps/desktop
pnpm test:e2e --grep "should update Recent Projects menu when a project is added"
```
