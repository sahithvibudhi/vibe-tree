# Error 001: Strict Mode Violation - Multiple "Close" Buttons

## Test
`worktree-deletion-with-pty-cleanup.spec.ts:90:7 › should show deletion reporting dialog and kill PTY processes when deleting worktree`

## Error Message
```
Error: expect.toBeVisible: Error: strict mode violation: locator('button').filter({ hasText: 'Close' }) resolved to 2 elements:
    1) <button class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">Close</button> aka locator('div').filter({ hasText: /^Close$/ }).getByRole('button')
    2) <button type="button" class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">…</button> aka getByRole('button', { name: 'Close' }).nth(1)
```

## Location
`apps/desktop/e2e/worktree-deletion-with-pty-cleanup.spec.ts:191:31`

## Root Cause
The deletion reporting dialog has TWO "Close" buttons:
1. A primary "Close" button in the DialogFooter (the main action button)
2. A decorative "X" close button in the DialogHeader (the small X icon at top-right)

The test selector `page.locator('button', { hasText: 'Close' })` matches BOTH buttons, causing a strict mode violation.

## Retries
- Test #24: Failed
- Test #25 (retry #1): Failed
- Test #26 (retry #2): Failed

## Fix Strategy
Update the test selector to be more specific. Use one of:
1. `page.locator('button').filter({ hasText: /^Close$/ }).first()` - Select first matching button
2. `page.getByRole('button', { name: 'Close', exact: true }).filter({ hasText: 'Close' }).first()` - More explicit
3. Add `data-testid="close-button"` to the primary Close button in DeletionReportingDialog and use that

**Recommended**: Option 3 (data-testid) is the most reliable and maintainable approach.
