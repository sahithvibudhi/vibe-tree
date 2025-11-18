# E2E Test Failure: Missing path import

## Test Files
- `e2e/worktree-deletion-with-pty-cleanup.spec.ts`

## Failing Tests
1. should show deletion reporting dialog and kill PTY processes when deleting worktree
2. should report errors in deletion dialog if PTY cleanup fails
3. should handle cancellation of worktree deletion
4. should display error in deletion dialog when folder deletion fails

## Error
```
ReferenceError: path is not defined

  22 |     testWorktreePath = worktreePath!;
  23 |
> 24 |     const testMainPath = path.join(__dirname, '../dist/main/test-index.js');
     |                          ^
  25 |     console.log('Using test main file:', testMainPath);
  26 |
  27 |     const appDir = path.join(__dirname, '..');
```

## Root Cause
During refactoring, the `import path from 'path';` statement was accidentally removed from the imports while the code still uses `path.join()` on lines 24 and 27.

## Fix
Add back the missing import:
```typescript
import path from 'path';
```

## Files to Change
- apps/desktop/e2e/worktree-deletion-with-pty-cleanup.spec.ts
