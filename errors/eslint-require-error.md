# ESLint Error: require() not part of import statement

## GitHub Actions Run
- Run ID: 18766006269
- Job ID: 53541102562
- Workflow: Lint & Type Check
- Branch: fix-split-cannot-be-closed

## Failed File
- `e2e/terminal-split-close-retry.spec.ts:149`

## Error Details
```
149:27  error  Require statement not part of import statement  @typescript-eslint/no-var-requires
```

## Code Location
Line 149 in `e2e/terminal-split-close-retry.spec.ts`:
```typescript
await electronApp.evaluate(async () => {
  const { ipcMain } = require('electron');  // <-- ERROR HERE (line 149)
  // Override the terminate handler to fail once
  let failCount = 0;
  ipcMain.removeHandler('shell:terminate');
  ipcMain.handle('shell:terminate', async () => {
    failCount++;
    if (failCount === 1) {
      // First call fails to simulate PTY cleanup error
      return { success: false };
    }
    // Subsequent calls succeed
    return { success: true };
  });
});
```

## Root Cause
Using `require('electron')` inside `electronApp.evaluate()` is:
1. Against ESLint rules (@typescript-eslint/no-var-requires)
2. Doesn't work in Electron renderer context anyway (causes `require is not defined` error)

## Fix Strategy
The `electronApp.evaluate()` runs code in the Electron main process context, where `require` should be available.
However, the ESLint rule forbids it.

Options:
1. Disable ESLint rule for this specific line
2. Use a different approach to inject the failure (e.g., environment variable)
3. Move the IPC handler override to a test helper in the main process
