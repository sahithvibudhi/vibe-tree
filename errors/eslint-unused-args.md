# ESLint Unused Args in TerminalGrid.test.tsx

## GitHub Actions Run
- Run ID: 18739134103
- Workflow: CI
- Branch: fix-split-cannot-be-closed
- Failed Job: Lint & Type Check (ID 53451704321)

## Failed Lint Checks
- apps/desktop/src/renderer/components/TerminalGrid.test.tsx:24:46
- apps/desktop/src/renderer/components/TerminalGrid.test.tsx:88:46
- apps/desktop/src/renderer/components/TerminalGrid.test.tsx:140:46

## Error Details
```
error  '_args' is defined but never used  @typescript-eslint/no-unused-vars
```

## Root Cause
The mock functions have a parameter `_args` with an underscore prefix to indicate it's intentionally unused. However, ESLint still complains about it being defined but never used.

## Fix Strategy
Add ESLint disable comment for each mock function declaration to suppress the unused variable warning, or configure the rule to allow unused variables with underscore prefix.

## Affected Code
Lines 24, 88, and 140:
```typescript
const mockHandleTerminalClose = vi.fn((_args: { terminalId: string; processId: string }) => {
```
