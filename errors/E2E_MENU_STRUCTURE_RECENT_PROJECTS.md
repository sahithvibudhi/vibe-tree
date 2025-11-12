# E2E Menu Structure - Recent Projects Not Updating (FLAKY)

## Test Name
`menu-structure.spec.ts:177:7` - "should update Recent Projects menu when a project is added"

## Error
```
Error: Recent Projects menu did not update with test project (max attempts: 10)

at test-utils.ts:51

  49 |   }
  50 |
> 51 |   throw new Error(`${message} (max attempts: ${maxAttempts})`);
     |         ^
  52 | }
  53 |
    at waitUntil (/__w/vibe-tree/vibe-tree/apps/desktop/e2e/test-utils.ts:51:9)
    at /__w/vibe-tree/vibe-tree/apps/desktop/e2e/menu-structure.spec.ts:190:5
```

The test waits up to 2000ms (10 attempts at 200ms intervals) for the Recent Projects menu to update after adding a test project, but the menu never updates.

## Test Behavior (CI Job 55139357806)

### Initial Attempt
- ✘ Failed after 2.6s

### Retry #1
- ✓ Passed in 588ms

The test is **FLAKY** - it failed on the first attempt but passed on retry.

## Root Cause

This appears to be a **race condition** or **timing issue**:

1. Test adds a project via IPC handler: `recent-projects:add`
2. Test immediately checks if menu was updated using `waitUntil()` with 2000ms timeout
3. On first attempt: Menu doesn't update within 2000ms
4. On retry: Menu updates within 588ms

**Possible causes:**
- Menu update happens asynchronously after IPC handler completes
- Menu rebuild/refresh may not be triggered immediately
- Electron menu update may be delayed on first app launch vs subsequent operations
- CI environment may have different timing than local environment

## Test Code Analysis (menu-structure.spec.ts:177-223)

The test checks for these conditions to consider menu updated (lines 214-219):
```typescript
const projectLabels = menuStructure.map((item) => item.label).filter(Boolean);
return projectLabels.some((label: string) =>
  label === 'Clear Recent Projects' ||
  label === 'No Recent Projects' ||
  (label.includes('test') && label.includes(testProjectPath))
);
```

It expects to find either:
- "Clear Recent Projects" menu item
- "No Recent Projects" menu item
- A menu item containing both "test" and the test project path (`/test/project/path`)

## Investigation Needed

1. Check if `recent-projects:add` IPC handler properly triggers menu update
2. Verify menu rebuild timing in `menu.ts`
3. Check if there's a debounce or delay on menu updates
4. Determine if menu updates happen synchronously or asynchronously

## Options

### Option 1: Increase Timeout (Quick Fix)
Increase `timeoutMs` from 2000ms to 5000ms or higher to accommodate slower CI environment.

**Files to modify:**
- `apps/desktop/e2e/menu-structure.spec.ts:221` - Change `timeoutMs: 2000` to `timeoutMs: 5000`

### Option 2: Add Explicit Wait After IPC Call
Add a short delay (e.g., 500ms) after calling the IPC handler before checking menu:
```typescript
await handler(null, projectPath);
await page.waitForTimeout(500); // Wait for menu to rebuild
```

**Files to modify:**
- `apps/desktop/e2e/menu-structure.spec.ts:187` - Add wait after IPC handler call

### Option 3: Fix Menu Update Synchronization
Ensure the menu update completes before the IPC handler returns. This would make the behavior deterministic.

**Files to check:**
- `apps/desktop/src/main/menu.ts` - Menu creation and update logic
- `apps/desktop/src/main/ipc-handlers.ts` - IPC handler for `recent-projects:add`

### Option 4: Accept Flakiness
The test framework already has retry logic, and the test passes on retry. We could accept this as expected behavior if menu updates are inherently async.

## Recommendation

**Option 1 + Option 2**: Increase the timeout to 5000ms AND add a 500ms explicit wait after the IPC call. This ensures we give enough time for the menu update to propagate, especially in slower CI environments.

If the test still fails after this change, then we need **Option 3** to fix the underlying race condition in the menu update logic.

## Status
**FLAKY** - Not consistently failing. Passed on retry. Lower priority than consistently failing tests.

## Files to Check

1. `apps/desktop/src/main/menu.ts` - Menu creation and update logic
2. `apps/desktop/src/main/ipc-handlers.ts` - IPC handler for `recent-projects:add`
3. `apps/desktop/e2e/test-utils.ts:51` - `waitUntil()` implementation
4. `apps/desktop/e2e/menu-structure.spec.ts:177-223` - Test implementation
