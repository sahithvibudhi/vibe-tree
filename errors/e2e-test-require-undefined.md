# E2E Test Error: require is not defined

## GitHub Actions Run
- Run ID: 18766006269
- Job ID: 53541102688
- Workflow: E2E Tests
- Branch: fix-split-cannot-be-closed

## Failed Test
- `e2e/terminal-split-close-retry.spec.ts:119`
- Test: "should allow closing terminal even after PTY cleanup fails"
- Retried 2 times, all failed

## Error Details
```
Error: electronApplication.evaluate: ReferenceError: require is not defined
    at eval (eval at evaluate (:291:30), <anonymous>:4:11)
    at UtilityScript.evaluate (<anonymous>:293:16)
    at e2e/terminal-split-close-retry.spec.ts:148:23
```

## Code Location
```typescript
// Inject a failure into the shell terminate function to simulate cleanup error
await electronApp.evaluate(async () => {
  const { ipcMain } = require('electron');  // <-- ERROR: require is not defined
  // ... rest of the code
});
```

## Root Cause
The code is trying to use `require()` inside `electronApp.evaluate()`, but:
1. The evaluation context doesn't have `require` defined
2. This is the wrong approach for injecting failures in e2e tests

## Fix Strategy
Instead of trying to override IPC handlers at runtime, we should:
1. Use environment variables to trigger test failures
2. Check for test mode in the actual implementation
3. OR: Create a test-specific IPC handler that can inject failures
