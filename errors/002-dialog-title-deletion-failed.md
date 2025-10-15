# Error 002: No Error Icons Displayed in Deletion Dialog

## Test
`worktree-deletion-with-pty-cleanup.spec.ts:328:7 › should display error in deletion dialog when folder deletion fails`

## Error Message
```
Error: expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 1
Received:    0

  400 |     const errorIcons = page.locator('svg.lucide-x-circle');
  401 |     const errorIconCount = await errorIcons.count();
> 402 |     expect(errorIconCount).toBeGreaterThanOrEqual(1); // At least one error icon should be present
      |                            ^
  403 |
  404 |     // Verify the error message is displayed
  405 |     await expect(page.locator('text=Permission denied').first()).toBeVisible();
```

## Location
`apps/desktop/e2e/worktree-deletion-with-pty-cleanup.spec.ts:402:28`

## Root Cause
The test mocks the `git:worktree-remove` IPC handler to throw an error ("Permission denied: Cannot delete worktree directory"), but the error is NOT being displayed in the deletion dialog:
- Test expects at least 1 error icon (`svg.lucide-x-circle`) but found 0
- This means the error handling in `WorktreePanel.tsx` is not catching/displaying the error correctly
- Dialog title shows "Deletion Failed" (which is correct) but no error icons or error messages are visible

## Retries
- Test #29: Failed (0 error icons)
- Test #30 (retry #1): Failed (0 error icons)
- Test #31 (retry #2): Failed (0 error icons)

## Fix Strategy
1. Check how errors from `window.electronAPI.git.removeWorktree()` are caught in `WorktreePanel.tsx`
2. Verify the error is being set in the deletion step with status 'error' and error message
3. Ensure `XCircle` icons render when step.status === 'error'
4. Check if the mock in the test is correctly replacing the IPC handler
