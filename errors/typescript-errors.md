# TypeScript Type Errors

## GitHub Actions Run
- Run ID: 17814996740
- Workflow: CI
- Branch: custom-font
- Failed Job: Lint & Type Check

## Failed Files
- `apps/desktop/src/renderer/components/ClaudeTerminal.tsx`
- `apps/desktop/src/renderer/components/TerminalSettings.tsx`

## Error Details

### ClaudeTerminal.tsx
Lines 155-161, 491-495: Type 'unknown' is not assignable to specific property types
- fontFamily: string | undefined
- fontSize: number | undefined
- cursorBlink: boolean | undefined
- scrollback: number | undefined
- tabStopWidth: number | undefined

### TerminalSettings.tsx
Multiple type errors:
- Line 42: 'settings' is possibly 'null'
- Line 42: Argument of type 'unknown' is not assignable to parameter of type 'SetStateAction<string>'
- Lines 136, 150, 158, 181, 197, 214, 233: Type 'unknown' is not assignable to form input values

## Root Cause
Changed `terminalSettings` type from `any` to `Record<string, unknown> | null` but didn't add proper type guards and assertions when accessing specific properties.

## Fix Strategy
1. Create a proper TerminalSettings interface
2. Use type assertions or guards when accessing settings properties
3. Handle null checks properly before accessing settings