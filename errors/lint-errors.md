# Lint Errors

## GitHub Actions Run
- Run ID: 17814534141
- Workflow: CI
- Branch: custom-font
- Failed Job: Lint & Type Check

## Failed Files

### Critical Error (Must Fix)
- `apps/desktop/e2e/terminal-settings.spec.ts:78:11` - 'initialFont' is assigned a value but never used

### Warnings (Should Fix)
- Multiple `@typescript-eslint/no-explicit-any` warnings
- React hooks exhaustive-deps warnings in ClaudeTerminal.tsx

## Error Details

```
/apps/desktop/e2e/terminal-settings.spec.ts
  78:11  error  'initialFont' is assigned a value but never used  @typescript-eslint/no-unused-vars

/apps/desktop/src/renderer/components/ClaudeTerminal.tsx
  298:6  warning  React Hook useEffect has missing dependencies
  455:6  warning  React Hook useEffect has a missing dependency: 'terminalId'
  549:6  warning  React Hook useEffect has a missing dependency: 'worktreePath'
```

## Root Cause
1. Unused variable in test file
2. TypeScript any types need proper typing
3. React hooks missing dependencies

## Fix Strategy
1. Remove unused variable `initialFont`
2. Add proper TypeScript types for terminal settings
3. Fix React hook dependencies or add eslint-disable comments where appropriate