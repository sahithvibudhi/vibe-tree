# E2E Menu Structure Recent Projects Test - Flaky

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

## Root Cause
The test is marked as "flaky" (not consistently failing), which means:

1. The Recent Projects menu update is not happening fast enough or reliably enough
2. The `waitUntil` helper (from test-utils.ts:51) tried 10 times to verify the menu update but failed
3. This is a timing/race condition issue

## Test File Locations
- Test: `apps/desktop/e2e/menu-structure.spec.ts` line 177
- Helper: `apps/desktop/e2e/test-utils.ts` line 51

## Investigation Needed
- Check the implementation of Recent Projects menu update
- Verify if there's a delay in updating the menu after a project is added
- Check if IPC communication between main and renderer process is delayed
- Review the `waitUntil` retry logic and timing

## Status
**FLAKY** - This test passed on some runs but failed on this CI run. This is lower priority than the consistently failing tests.

## Potential Fixes
1. Increase retry attempts or wait time in `waitUntil`
2. Add explicit event listener to wait for menu update confirmation
3. Force menu refresh after adding project
4. Add debouncing to menu updates to ensure they complete
