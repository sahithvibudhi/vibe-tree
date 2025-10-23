# Stats Menu E2E - Terminal Not Visible

## GitHub Actions Run
- Run ID: 18733194801
- Workflow: CI/CD Pipeline
- Branch: show-node-pty-processes
- Failed Job: E2E Tests

## Failed Tests
- `e2e/stats-menu.spec.ts:88:7` - "should show correct count after opening terminal"
- `e2e/stats-menu.spec.ts:132:7` - "should show correct count with multiple terminals"

## Error Details
```
Error: expect(locator).toBeVisible() failed

Locator:  locator('.xterm-screen').first()
Expected: visible
Received: <element(s) not found>
Timeout:  10000ms
```

## Root Cause
The tests are waiting for `.xterm-screen` element to become visible after opening a project,
but the terminal is not appearing within the 10-second timeout. This could be because:

1. The project isn't opening correctly in the test environment
2. The terminal takes longer to initialize in CI
3. The selector `.xterm-screen` might be incorrect or the element structure changed

## Fix Strategy
1. Increase timeout to 15-20 seconds for terminal visibility
2. Add more robust wait conditions (wait for project open, then terminal)
3. Use a different/better selector if needed
4. Add debug logging to see what's actually happening
5. Check if we need to wait for project loading first
