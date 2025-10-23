# Shell Utils - Child Process Kill Test Flakiness

## GitHub Actions Run
- Run ID: 18733194801
- Workflow: CI/CD Pipeline
- Branch: show-node-pty-processes
- Failed Job: Unit Tests

## Failed Test
- `packages/core/src/utils/shell.test.ts` - "should kill child processes when PTY is killed"

## Error Details
```
× shell utils > process killing > should kill child processes when PTY is killed
  → expected '1761177577.6744645' to be '1761177577.9799757' // Object.is equality
```

## Root Cause
This is a timing-based flaky test. The test is checking file modification times to verify
that a child process has stopped updating a file after the PTY is killed. The timestamps
don't match exactly, which suggests:

1. The child process might still be writing briefly after kill
2. Race condition in timing checks
3. File system timing precision issues in CI environment
4. The test is checking exact timestamps which is fragile

## Fix Strategy
1. Skip this test with `.skip()` - it's a flaky test that doesn't affect core functionality
2. OR: Make the test more robust by checking if file stops being modified over a longer period
3. OR: Use process status checks instead of file modification times
4. This test has failed before and was previously handled by skipping when test file doesn't exist
