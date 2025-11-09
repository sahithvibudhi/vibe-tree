# TypeScript Type Errors - Scheduler History

## Test Files Affected
- `src/main/scheduler-history.test.ts`
- `src/renderer/components/SchedulerDialog.test.tsx`
- `src/renderer/components/SchedulerDialog.tsx`

## Errors

### 1. Jest Globals Import Error
**File:** `src/main/scheduler-history.test.ts:1:67`
**Error:** `TS2307: Cannot find module '@jest/globals' or its corresponding type declarations.`

**Root Cause:** Using Jest imports in a Vitest test file. Vitest uses different globals.

### 2. Unused Variables in Test
**Files:**
- `src/main/scheduler-history.test.ts:17:7` - `SchedulerHistoryManager` is declared but never used
- `src/main/scheduler-history.test.ts:18:7` - `schedulerHistoryManager` is declared but never used
- `src/main/scheduler-history.test.ts:33:13` - `manager` is declared but never used
- `src/main/scheduler-history.test.ts:156:13` - `timestamp1` is declared but never used
- `src/renderer/components/SchedulerDialog.test.tsx:710:13` - `container` is declared but never used

**Root Cause:** Leftover from refactoring test structure. Variables are not being used.

### 3. ElectronAPI Type Missing schedulerHistory
**Files:** Multiple instances in `SchedulerDialog.test.tsx` and `SchedulerDialog.tsx`
**Error:** `TS2339: Property 'schedulerHistory' does not exist on type 'ElectronAPI'.`

**Root Cause:** The ElectronAPI type export in `src/preload/index.ts` doesn't include the `schedulerHistory` we added. TypeScript doesn't know about it.

### 4. Unused Import
**File:** `src/renderer/components/SchedulerDialog.tsx:5:84`
**Error:** `TS6133: 'DropdownMenuSeparator' is declared but its value is never read.`

**Root Cause:** Imported but not used in the component.

## Fix Plan
1. Replace `@jest/globals` with `vitest` imports
2. Remove unused variables from tests
3. Update ElectronAPI type export (it should auto-export, verify)
4. Remove unused `DropdownMenuSeparator` import
