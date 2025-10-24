# PTY Stress Test Not Hitting posix_spawnp Error

## GitHub Actions Run
- Run ID: 18775352578
- Workflow: CI
- Branch: fix-posix_spawnp-failed
- Failed Job: E2E Tests (ID: 53568680070)
- Run URL: https://github.com/sahithvibudhi/vibe-tree/actions/runs/18775352578

## Failed Tests
- `apps/desktop/e2e/worktree-posix-spawnp-stress-test.spec.ts:93:7` - "Worktree posix_spawnp Stress Test › should verify PTY cleanup frees resources"

## Error Details
```
Error: Test FAILED: Did not hit posix_spawnp error after creating 250 PTY sessions.
This test MUST hit OS limits to verify cleanup works (CI uses ulimit -n 512).

  170 |     // With ulimit -n 512, we MUST hit the posix_spawnp error
  171 |     if (!hitPosixSpawnpError) {
> 172 |       throw new Error(
      |             ^
  173 |         `Test FAILED: Did not hit posix_spawnp error after creating ${createdPtyIds.length} PTY sessions. ` +
  174 |         `This test MUST hit OS limits to verify cleanup works (CI uses ulimit -n 512).`
  175 |       );
```

## Root Cause Analysis

The test is **failing because it's NOT hitting the expected error**. This is actually a sign that the PTY cleanup is working TOO WELL!

The test's purpose is to:
1. Create many PTY sessions until hitting `posix_spawnp` error (OS resource limit)
2. Clean up PTY sessions
3. Verify that new PTYs can be created after cleanup

However, with `ulimit -n 512` (limiting file descriptors to 512), the test creates 250 PTY sessions but never hits the `posix_spawnp` error. This suggests one of the following:

1. **PTY sessions are being automatically cleaned up** - The system might be properly cleaning up file descriptors as PTY processes exit, preventing the limit from being reached
2. **Each PTY uses fewer file descriptors than expected** - Modern systems might be more efficient with file descriptor usage
3. **The test assumption is wrong** - 512 file descriptors might be enough for 250+ PTY sessions

## Test File Location
`apps/desktop/e2e/worktree-posix-spawnp-stress-test.spec.ts`

## Fix Strategy

We need to adjust the test to actually hit the resource limit. Options:

1. **Lower the ulimit further** - Reduce from 512 to a lower value (e.g., 256 or 128) in CI
2. **Keep PTY sessions alive** - Ensure the PTY processes don't exit/cleanup during the test
3. **Increase the number of PTYs** - Try to create more than 250 PTY sessions
4. **Add resource monitoring** - Log file descriptor usage to understand what's actually happening
5. **Change test approach** - Instead of trying to hit the limit naturally, mock or simulate the error condition

The most reliable approach would be a combination of:
- Lowering the ulimit to a more aggressive value
- Ensuring PTY sessions stay alive during the stress test phase
- Adding better diagnostics to see file descriptor usage

## Additional Notes
- The test has 3 retries and fails on all attempts
- One test "Application Menu Structure › should update Recent Projects menu when a project is added" also failed once but passed on retry (likely flaky, unrelated to this issue)
