# ESLint Error: Require Statement Not Part of Import Statement

## Job
Lint & Type Check (Job ID: 55888265026)

## Test/File
`apps/desktop/e2e/helpers/test-launcher.ts:53:39`

## Error Message
```
error  Require statement not part of import statement  @typescript-eslint/no-var-requires
```

## Root Cause
The code uses `require()` inside an `electronApp.evaluate()` callback at line 53:
```typescript
const { shellProcessManager } = require('./shell-manager');
```

This violates the ESLint rule `@typescript-eslint/no-var-requires` which requires using ES6 import statements instead of CommonJS require.

However, this is inside a Playwright `evaluate()` callback that runs in the Electron context, not the test context. The code inside `evaluate()` is stringified and executed in the Electron process, where it needs to dynamically require modules.

## Solution
Since this code runs in the Electron context and requires dynamic module loading, we need to:
1. Use ESLint disable comment to suppress the rule for this specific case
2. Or restructure to avoid the dynamic require

The proper fix is to use an ESLint disable comment since the require is necessary in the Electron evaluation context.

## Status
✅ **RESOLVED** - Added `// eslint-disable-next-line @typescript-eslint/no-var-requires` comment above the require statement in `apps/desktop/e2e/helpers/test-launcher.ts:53`
