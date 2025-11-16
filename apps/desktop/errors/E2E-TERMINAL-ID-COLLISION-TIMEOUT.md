# E2E Test Failure: Terminal ID Collision Test Timeout

## Test Name
`e2e/terminal-id-collision.spec.ts:63 - should not leak PTYs when rapidly splitting terminals`

## Error Type
TimeoutError - Playwright locator.toBeVisible

## Error Message
```
Error: expect(locator).toBeVisible(): Locator resolved to 0 elements
Timeout 30000ms exceeded.

    83 |   const worktreeButton = window.locator('button[data-worktree-branch="main"]');
  > 84 |   await expect(worktreeButton).toBeVisible({ timeout: 30000 });
         |                               ^
    85 |   await worktreeButton.click();
```

## Root Cause
The test uses raw `electron.launch()` directly instead of the retry-enabled helper functions used by all other successful e2e tests. This causes multiple issues on CI:

1. **No launch retry mechanism** - If Electron launch fails or is slow, test fails immediately
2. **Uses `beforeAll/afterAll`** instead of `beforeEach/afterEach` - Single test setup/teardown is fragile
3. **Missing proper page/window management** - Not using `launchElectronAppWithWindow()` helper
4. **No `waitForLoadState` call** - Test doesn't ensure page is properly loaded before interactions
5. **Dialog mocking may not work correctly** - Without proper window setup, dialog mocking can fail silently

Comparing to other successful tests (e.g., `terminal-split.spec.ts`, `terminal-split-close-retry.spec.ts`):
- They use `launchElectronAppWithWindow()` helper with retry logic
- They use `beforeEach/afterEach` for proper isolation
- They call `page.waitForLoadState('domcontentloaded')` before interactions
- They use consistent helper functions for navigation

## Fix
1. Refactor test to use `launchElectronAppWithWindow()` helper like other e2e tests
2. Change from `beforeAll/afterAll` to `beforeEach/afterEach` pattern
3. Use the same `navigateToWorktree()` helper pattern that works in other tests
4. Add proper `page.waitForLoadState()` calls
5. Use consistent test patterns matching `terminal-split.spec.ts` and `terminal-split-close-retry.spec.ts`
