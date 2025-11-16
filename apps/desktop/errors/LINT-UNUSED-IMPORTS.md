# Lint Error: Unused Imports

## Test Name
Lint & Type Check Job (GitHub Actions CI)

## Error Type
ESLint - @typescript-eslint/no-unused-vars

## Files Affected
1. `e2e/terminal-split-close-retry.spec.ts` - Line 2
2. `e2e/terminal-split.spec.ts` - Line 2
3. `e2e/worktree-posix-spawnp-stress-test.spec.ts` - Line 2

## Error Messages
```
e2e/terminal-split-close-retry.spec.ts
  2:50  error  'electron' is defined but never used  @typescript-eslint/no-unused-vars

e2e/terminal-split.spec.ts
  2:50  error  'electron' is defined but never used  @typescript-eslint/no-unused-vars

e2e/worktree-posix-spawnp-stress-test.spec.ts
  2:44  error  'electron' is defined but never used  @typescript-eslint/no-unused-vars
```

## Root Cause
During the previous session's test fixes (unskipping tests and fixing imports), the `electron` import was added to destructuring but not used in the test files. The tests were refactored to use helper functions that handle Electron launch internally, making the direct `electron` import unnecessary.

## Fix
Remove the unused `electron` import from the destructuring in each file's import statement.
