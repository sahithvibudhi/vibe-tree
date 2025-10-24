# PTY Stress Test Not Hitting OS Limits

## GitHub Actions Run
- Run ID: 18775833884
- Workflow: CI/CD Pipeline - Fix PTY spawn slot cleanup by waiting for exit event
- Branch: fix-posix_spawnp-failed
- Failed Job: E2E Tests

## Failed Tests
- e2e/worktree-pty-stress-close-all.spec.ts - Multiple workers failing

## Error Details
```
Error: Test FAILED: Did not hit posix_spawnp error after creating 47 PTY sessions. This test MUST hit OS limits to verify cleanup works (CI uses ulimit -n 128).
Error: Test FAILED: Did not hit posix_spawnp error after creating 42 PTY sessions. This test MUST hit OS limits to verify cleanup works (CI uses ulimit -n 128).
Error: Test FAILED: Did not hit posix_spawnp error after creating 42 PTY sessions. This test MUST hit OS limits to verify cleanup works (CI uses ulimit -n 128).
```

## Root Cause
The PTY stress test is designed to verify that PTY cleanup works correctly when hitting OS resource limits (specifically file descriptor limits set by ulimit -n 128 in CI). However, the test is not hitting the expected posix_spawnp error after creating ~42-47 PTY sessions.

This suggests one of the following issues:

1. **PTY processes are being cleaned up too efficiently**: The recent fix to wait for the exit event before cleaning up PTY processes may have improved cleanup so much that file descriptors are being released quickly enough that the test never hits the limit.

2. **File descriptor usage is lower than expected**: Each PTY session may not be using as many file descriptors as anticipated, or the system is reusing file descriptors more efficiently.

3. **Test logic issue**: The test may need to create PTY sessions faster or prevent cleanup from happening during the stress test phase.

4. **ulimit configuration**: The ulimit -n 128 setting may not be applied correctly in the CI environment, or the base system usage is lower than expected.

## Context from Recent Commits
Looking at the recent commit history:
- a36d07f6: "Reduce ulimit to 128 to reliably trigger posix_spawnp errors in stress test"
- c8a68f7e: "Increase MAX_WORKTREES to 1000 to guarantee hitting ulimit"
- c20465b7: "Use ulimit -n instead of ulimit -u for Docker compatibility"
- 5967a26a: "Use ulimit to guarantee hitting PTY limits in CI"

The team has been trying to ensure the test reliably hits the limits. The current fix branch is attempting to fix PTY cleanup by waiting for exit events, which may have inadvertently made cleanup so efficient that the stress test can no longer trigger the error.

## Fix Strategy

1. **Verify ulimit is being applied**: Check that ulimit -n 128 is actually being set in the CI workflow
2. **Analyze PTY cleanup timing**: Review the recent changes to PTY process cleanup to understand if file descriptors are being released before the test expects
3. **Adjust test strategy**: Either:
   - Disable cleanup during the stress test phase to ensure we hit the limit
   - Lower the ulimit further (e.g., ulimit -n 64)
   - Create PTY sessions faster to outpace cleanup
   - Add verification that ulimit is actually in effect before running the test
4. **Consider test redesign**: The test may need to be rethought - if cleanup works perfectly, we may need a different approach to verify it's working correctly

## Investigation Steps

1. Check the CI workflow configuration for ulimit settings
2. Review the PTY cleanup implementation changes on this branch
3. Examine the stress test implementation to understand how it creates and manages PTY sessions
4. Determine if we need to temporarily disable cleanup during the stress phase, or if we need a different test approach
