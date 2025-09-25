# E2E Test Timeout Issue

## GitHub Actions Run
- Run ID: 17940929293
- Workflow: CI/CD Pipeline
- Branch: confirm-on-quit
- Failed Job: E2E Tests (Job ID: 51017195769)
- Duration: 2h 2m 31s (timeout)

## Problem
E2E tests are timing out after 2 hours, likely because the quit confirmation dialog is blocking test execution when tests try to close the application.

## Root Cause
The quit confirmation dialog introduced in this PR is blocking E2E tests that need to close/restart the Electron application. Tests cannot proceed because they're waiting for user interaction on the modal dialog.

## Affected Tests
- All E2E tests that close or restart the application
- Specifically: quit-confirmation.spec.ts tests may be blocking

## Fix Strategy
1. Ensure all E2E tests properly handle application cleanup
2. Use environment variable DISABLE_QUIT_DIALOG=true for non-quit-related tests
3. Fix the quit confirmation test to properly clean up after itself