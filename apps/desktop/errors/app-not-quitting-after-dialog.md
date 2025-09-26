# App Not Quitting After Dialog Confirms

## GitHub Actions Run
- Run ID: 18030411345
- Workflow: CI
- Branch: confirm-on-quit
- Failed Job: E2E Tests (ID 51305470458)

## Failed Test
- `e2e/quit-confirmation.spec.ts:48:7` - "Quit Confirmation Dialog › with dialog enabled - should quit when user confirms"

## Error Details
```
Error: App should have quit but still has 0 windows
Location: Line 87 in quit-confirmation.spec.ts
```

## Root Cause
The app closes all windows (0 windows) when dialog returns OK, but the app process doesn't quit. We can still communicate with it via electronApp.evaluate. This suggests the quit logic isn't working properly when the dialog confirms.

## Fix Strategy
The issue is likely in the quit-manager implementation. When dialog returns OK (index 1), it should call confirmQuit() which should force app.quit(). Need to verify the quit manager is properly calling app.quit() with the isQuitting flag set.