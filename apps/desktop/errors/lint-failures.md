# Lint Failures

## GitHub Actions Run
- Run ID: 18004839623
- Workflow: CI
- Branch: confirm-on-quit
- Failed Job: Lint & Type Check

## Failed Linting Issues

### 1. Unused Import
- File: `apps/desktop/e2e/quit-confirmation.spec.ts:2`
- Error: `'ElectronApplication' is defined but never used`
- Severity: Error

### 2. Unexpected any Type
- File: `apps/desktop/e2e/quit-confirmation.spec.ts:84`
- Error: `Unexpected any. Specify a different type`
- Severity: Warning

### 3. React Hook Dependencies
Multiple warnings about missing dependencies in useEffect hooks:

- File: `apps/desktop/src/renderer/components/ClaudeTerminal.tsx:299`
  - Missing: `searchVisible`, `terminalSettings`, `theme`, `worktreePath`

- File: `apps/desktop/src/renderer/components/ClaudeTerminal.tsx:456`
  - Missing: `terminalId`

- File: `apps/desktop/src/renderer/components/ClaudeTerminal.tsx:550`
  - Missing: `worktreePath`

## Root Cause
1. Unused import left over from refactoring
2. Missing type annotation for error catch block
3. React Hook exhaustive deps warnings

## Fix Strategy
1. Remove unused ElectronApplication import
2. Replace `any` with proper error type
3. Add missing dependencies or disable warnings if intentional