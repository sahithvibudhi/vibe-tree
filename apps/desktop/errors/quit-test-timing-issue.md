# Quit Test Timing Issue

## GitHub Actions Run
- Run ID: 18024370733
- Workflow: CI
- Branch: confirm-on-quit
- Failed Job: E2E Tests (ID 51288553215)

## Failed Test
- `e2e/quit-confirmation.spec.ts:48:7` - "Quit Confirmation Dialog › with dialog enabled - should quit when user confirms"

## Error Details
```
Error: page.waitForTimeout: Target page, context or browser has been closed
Location: Line 79 in quit-confirmation.spec.ts
```

## Root Cause
The app is correctly quitting when the dialog returns OK (index 1), but it's happening so fast that `page.waitForTimeout(500)` throws an error because the page is already closed. This is actually the SUCCESS case - the app quit as expected!

## Fix Strategy
Remove the `page.waitForTimeout(500)` call and catch the error immediately after trying to quit. If we get a "Target page closed" error, that means the test passed (app quit successfully).