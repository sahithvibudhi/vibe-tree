# Claude Instructions

## GitHub Actions Failed Build Logs

View failing build logs: `gh api repos/{owner}/{repo}/actions/jobs/{jobId}/logs`

Example:
```bash
gh api repos/sahithvibudhi/vibe-tree/actions/jobs/51222513854/logs
```

This provides the full build logs for debugging CI/CD failures.

## Electron App Startup Issues

If the Electron app fails to start with errors like:
- `icudtl.dat not found in bundle`
- `Library not loaded: @rpath/Electron Framework.framework/Electron Framework`
- `Invalid file descriptor to ICU data received`

Run the following command from the project root to fix the Electron installation:

```bash
pnpm fix:electron
```

## E2E Testing

When you need to run, debug, or troubleshoot end-to-end Electron tests, use the `electron-e2e-test-runner` agent. This specialized agent handles:

- Running e2e tests for the Electron application
- Debugging test failures and process launch errors
- Resolving test timeouts and environment setup issues
- Interpreting test results and providing solutions

### Examples of when to use the electron-e2e-test-runner:

- When running `pnpm test:e2e` or similar e2e test commands
- When encountering "process not launched" errors in e2e tests
- When tests are timing out unexpectedly
- When you need to debug Electron test environment issues

The agent has access to all necessary tools and specialized knowledge for handling Electron e2e testing scenarios.

## Pull Requests

After completing any coding task, you should always create a pull request with the changes. This includes:

- Creating a new branch if not already on a feature branch
- Committing all changes with a descriptive commit message
- Pushing the branch to the remote repository
- Creating a pull request using `gh pr create` with a clear title and description
- Including a summary of the changes and test plan in the PR description

This ensures all code changes are properly reviewed and tracked through the PR process.