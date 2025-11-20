# E2E Test Worker Teardown Timeout

## Error
```
Worker teardown timeout of 120000ms exceeded.

Failed worker ran 46 tests, last 10 tests were:
[electron] › e2e/terminal-split.spec.ts:160:7 › Terminal Split Feature › should split terminal horizontally and manage multiple terminals
[electron] › e2e/terminal-split.spec.ts:230:7 › Terminal Split Feature › should maintain independent PTY sessions for split terminals
[electron] › e2e/worktree-deletion-with-pty-cleanup.spec.ts:54:7 › Worktree Deletion with PTY Cleanup › should show deletion reporting dialog and kill PTY processes when deleting worktree
[electron] › e2e/worktree-deletion-with-pty-cleanup.spec.ts:185:7 › Worktree Deletion with PTY Cleanup › should report errors in deletion dialog if PTY cleanup fails
[electron] › e2e/worktree-deletion-with-pty-cleanup.spec.ts:244:7 › Worktree Deletion with PTY Cleanup › should handle cancellation of worktree deletion
[electron] › e2e/worktree-deletion-with-pty-cleanup.spec.ts:292:7 › Worktree Deletion with PTY Cleanup › should display error in deletion dialog when folder deletion fails
[electron] › e2e/worktree-scheduler-indicator.spec.ts:76:7 › Worktree Scheduler Indicator Test › should show clock icon in worktree list when scheduler is active
[electron] › e2e/worktree-scheduler-indicator.spec.ts:204:7 › Worktree Scheduler Indicator Test › should handle scheduler indicator with multiple worktrees
[electron] › e2e/worktree-switch-double-char-bug.spec.ts:72:7 › Worktree Switch Double Character Bug › should NOT display double characters when switching between worktrees
[electron] › e2e/worktree-terminal-content-preservation.spec.ts:49:7 › Worktree Terminal Content Preservation › should preserve terminal content when switching between worktrees

46 passed (9.9m)
1 error was not a part of any test, see above for details
```

## Root Cause

The Playwright worker is failing to tear down within the 120-second timeout. This is happening after all 46 tests pass successfully, indicating the issue is in the cleanup/teardown phase.

**The actual problem:**
1. Tests use `process.exit(0)` to quickly close the app (see `apps/desktop/e2e/helpers/test-launcher.ts:47`)
2. When `process.exit(0)` is called, Electron's `before-quit` event is **NOT fired**
3. Therefore, `shellProcessManager.cleanup()` is never called
4. Fork processes remain running, preventing the worker from tearing down
5. Worker times out waiting for cleanup

**Chain of events:**
```
Test ends → closeElectronApp() → process.exit(0) →
App exits immediately (no before-quit event) →
Fork processes still running →
Worker tries to tear down →
Waits for processes to end →
Timeout after 120 seconds
```

## Solution

Since `process.exit(0)` bypasses all Electron lifecycle events, we need to clean up synchronously before the process exits:

**Option 1: Cleanup before process.exit**
Add cleanup directly in test-launcher before calling `process.exit(0)`:
```typescript
// In apps/desktop/e2e/helpers/test-launcher.ts
await electronApp.evaluate(async () => {
  const { shellProcessManager } = require('./shell-manager');
  await shellProcessManager.cleanup();
  process.exit(0);
});
```

**Option 2: Use app.quit() instead of process.exit()**
Change test-launcher to use `app.quit()` which properly fires lifecycle events:
```typescript
await electronApp.evaluate(() => {
  const { app } = require('electron');
  app.quit();
});
```

**Recommended: Option 1** because it's explicit and matches the existing pattern of using `process.exit()` for fast teardown.
