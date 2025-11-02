# TypeScript: IShellAPI Missing Error Property

## GitHub Actions Run
- Run ID: 19005533769
- Workflow: CI
- Branch: improve-terminal-close-error-details
- Failed Job: Lint & Type Check (ID: 54278416891)

## Failed Tests/Checks
- TypeScript compilation in `apps/desktop`

## Error Details
```
src/renderer/services/TerminalController.ts(51,33): error TS2339: Property 'error' does not exist on type '{ success: boolean; }'.
src/renderer/services/TerminalController.ts(52,69): error TS2339: Property 'error' does not exist on type '{ success: boolean; }'.
```

## Root Cause
The local interface `IShellAPI` in `TerminalController.ts` (lines 10-12) defines the `terminate` method return type as:
```typescript
Promise<{ success: boolean }>
```

However, the actual implementation in `electron.d.ts` (line 32) returns:
```typescript
Promise<{ success: boolean; error?: string }>
```

The code at lines 51-52 tries to access `result.error`, but TypeScript doesn't know about this property because the local `IShellAPI` interface doesn't include it.

## Fix Strategy
Update the `IShellAPI` interface in `TerminalController.ts` to include the optional `error` property:
```typescript
export interface IShellAPI {
  terminate(processId: string): Promise<{ success: boolean; error?: string }>;
}
```

## Files to Modify
- `apps/desktop/src/renderer/services/TerminalController.ts:10-12`
