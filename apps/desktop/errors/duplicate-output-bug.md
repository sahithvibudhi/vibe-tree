# Duplicate Terminal Output Bug

## Test Name
project-switch-duplicate-output.spec.ts:78:7 › Project Switch Duplicate Output Test › should not duplicate output when switching between projects

## Error
After executing `echo "unique1"`, the output appears 3 times instead of the expected 2 times (once for input, once for output).

## Location
**Primary Location:** apps/desktop/src/main/shell-manager.ts:107-136
**Secondary Location:** packages/core/src/workers/pty-worker.ts:122-135

## Root Cause
**Listener accumulation in DesktopShellManager's `shell:start` IPC handler.**

The DesktopShellManager was adding new output/exit listeners EVERY time `shell:start` IPC was called, even for existing sessions. This caused multiple listeners to be registered for the same terminal session.

**Data flow of the bug:**
1. User opens terminal for project 1 → `shell:start` called → adds listener #1 ✓
2. User opens terminal for project 2 → `shell:start` called → adds listener for project 2 ✓
3. User switches back to project 1 terminal → `shell:start` called with `isNew: false` → **adds listener #2 for project 1** ✗
4. Now every PTY output for project 1 triggers 2 listeners → **output appears 3 times** (input + 2x output) ✗✗

**Why it happens on FIRST command:**
The test opens 2 projects, then switches back to project 1 and opens its terminal. This triggers `shell:start` again for an existing session, which unconditionally adds a second set of listeners.

## Fixes Applied

### Fix 1: PTY Worker (LINE 1 OF DEFENSE)
Modified `packages/core/src/workers/pty-worker.ts` line 126 to only add listeners for NEW sessions:

```typescript
if (result.isNew) {
  this.sessionManager.addOutputListener(processId, 'worker-output', (data: string) => {
    this.sendEvent({ type: 'output', processId, data });
  });

  this.sessionManager.addExitListener(processId, 'worker-exit', (code: number) => {
    this.sendEvent({ type: 'exit', processId, code });
  });
}
```

This prevents the PTY worker from adding duplicate listeners at the lowest level.

### Fix 2: DesktopShellManager (LINE 2 OF DEFENSE - PRIMARY FIX)
Modified `apps/desktop/src/main/shell-manager.ts` to track which webContents is listening to which processId:

```typescript
class DesktopShellManager {
  // Track which webContents are listening to which processIds to prevent duplicate listeners
  private webContentsListeners = new Map<number, Set<string>>();

  // In shell:start handler:
  if (result.success && result.processId) {
    const processId = result.processId;
    const webContentsId = event.sender.id;

    // Only add listeners if this webContents isn't already listening to this processId
    if (!this.webContentsListeners.has(webContentsId)) {
      this.webContentsListeners.set(webContentsId, new Set());
    }

    const listenersForThisWebContents = this.webContentsListeners.get(webContentsId)!;

    if (!listenersForThisWebContents.has(processId)) {
      // Mark that this webContents is now listening to this processId
      listenersForThisWebContents.add(processId);

      // Add listeners (with cleanup on disposal/exit)
      ...
    }
  }
}
```

This is the primary fix because:
- Each webContents (renderer process/window) needs its own set of IPC listeners
- But the same webContents should NOT have duplicate listeners for the same processId
- When reconnecting to an existing PTY, the same webContents was adding duplicate listeners
- The fix tracks the webContents→processId relationship to prevent duplicates

## Verification
Created E2E test `project-switch-duplicate-output.spec.ts` that:
- Opens two projects
- Switches to project 1 and types `echo "unique1"`
- Verifies "unique1" appears exactly 2 times (input + output)
- Switches to project 2, types `echo "unique2"`
- Switches back to project 1
- Verifies "unique1" still appears exactly 2 times (no duplication from project switching)

## Status
FIXED ✅
