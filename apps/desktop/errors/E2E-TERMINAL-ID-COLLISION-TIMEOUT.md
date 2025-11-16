# E2E Test Failure: Terminal ID Collision Test Timeout

## Test Name
`e2e/terminal-id-collision.spec.ts:63 - should not leak PTYs when rapidly splitting terminals`

## Error Type
TimeoutError - Playwright locator.click

## Error Message
```
TimeoutError: locator.click: Timeout 30000ms exceeded.

    85 |   const worktreeButton = window.locator('button[data-worktree-branch="main"]');
  > 86 |   await worktreeButton.click();
         |                        ^
    87 |
    88 |   // Wait for first terminal to load
    89 |   await window.waitForSelector('.xterm-screen', { timeout: 10000 });
```

## Root Cause
The test waits only 2000ms after clicking "Open Project Folder" (line 82) before attempting to click on the worktree button. On CI, the worktree list loading and rendering takes longer due to slower I/O and git operations, causing the button to not be present when the click is attempted.

Additionally, the test uses `electron.launch()` directly instead of the retry-enabled helper function `launchElectronApp`, which doesn't provide resilience against launch failures.

## Fix
1. Add explicit wait for worktree button to be visible before clicking, with appropriate timeout
2. Use the consistent helper function pattern from other tests
3. Add retry logic for worktree button click to handle slow CI environments
