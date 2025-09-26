# Expect.fail Method Error

## GitHub Actions Run
- Run ID: 18023879985
- Workflow: CI
- Branch: confirm-on-quit
- Failed Job: E2E Tests (ID 51287092031)

## Failed Test
- `e2e/quit-confirmation.spec.ts:48:7` - "Quit Confirmation Dialog › with dialog enabled - should quit when user confirms"

## Error Details
```
Error: expect(received).toContain(expected)
Expected substring: "Target page, context or browser has been closed"
Received string: "_test.expect.fail is not a function"
```

Location: Line 88 in quit-confirmation.spec.ts

## Root Cause
The test is using `expect.fail()` which doesn't exist in Playwright's expect API. This is causing the test to fail with a function not found error.

## Fix Strategy
Replace `expect.fail()` with a proper assertion that will fail the test, such as:
- `throw new Error('App should have quit after confirming dialog')`
- Or use `expect(false).toBe(true)` with a descriptive message