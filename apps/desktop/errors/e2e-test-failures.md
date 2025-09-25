# E2E Test Failures

## GitHub Actions Run
- Run ID: 18004839623
- Workflow: CI
- Branch: confirm-on-quit
- Failed Job: E2E Tests

## Known Issues from Previous Runs

### 1. Quit Confirmation Test Timeouts
- Test: `e2e/quit-confirmation.spec.ts` - "with dialog enabled - should prevent quit"
- Issue: Test timeout of 60000ms exceeded
- Worker teardown timeout exceeded
- Tests retry 3 times before failing

### 2. Menu Structure Test (Flaky)
- Test: `e2e/menu-structure.spec.ts:176` - "should update Recent Projects menu when a project is added"
- Issue: Flaky test that sometimes fails to find the updated menu items

## Root Cause
1. Quit confirmation dialog blocking test cleanup when enabled
2. Test trying to close app with dialog still open
3. Menu test has race condition with menu updates

## Fix Strategy
1. Ensure proper cleanup in quit confirmation tests
2. Handle dialog state properly before attempting to close
3. Add proper waits for menu updates in menu structure test