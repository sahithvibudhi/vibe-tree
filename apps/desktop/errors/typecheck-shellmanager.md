# TypeCheck Error: shellManager Property Missing

## Test Name
@vibetree/web#typecheck

## Error
```
error TS2339: Property 'shellManager' does not exist on type 'Window & typeof globalThis'.
```

## Location
File: apps/web/src/components/TerminalView.tsx:441:22

## Root Cause
The code is accessing `window.shellManager` but this property is not declared in the Window interface type definitions. The web app has been refactored to use an adapter pattern and this is leftover code from the old architecture.

## Fix Applied
Removed the obsolete `window.shellManager.terminate()` call in the `closeSplitTerminal` function. The cleanup is already handled properly by the cleanup ref which contains all the necessary cleanup functions including session termination.

## Status
FIXED ✅
