# Running E2E Tests for VibeTree Desktop

This document explains how to successfully run the end-to-end (E2E) tests for the VibeTree desktop application.

## Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Git (for test scenarios involving worktrees)

## Steps to Run E2E Tests

### 1. Install Dependencies

First, install all project dependencies:

```bash
pnpm install
```

### 2. Build Workspace Dependencies

The desktop app depends on workspace packages (@vibetree/core and @vibetree/ui) that need to be built first:

```bash
pnpm build:deps
```

This command builds:

- `@vibetree/core` - Core functionality shared across applications
- `@vibetree/ui` - Shared UI components

### 3. Fix Electron Installation (if needed)

If you encounter "Process failed to launch!" errors during E2E tests, it's likely due to a corrupted Electron installation. Fix it using:

```bash
pnpm fix:electron
```

This command will properly install the Electron binary by running the install script in the Electron module directory.

### 4. Run the E2E Tests

Execute the E2E tests using:

```bash
pnpm --filter @vibetree/desktop test:e2e
```

This command will:

1. Build the desktop application (main, preload, and renderer processes)
2. Run all Playwright E2E tests

## Test Structure

The E2E tests are located in `apps/desktop/e2e/` and include:

- **ci-smoke-test.spec.ts** - Basic build verification tests
- **final-test.spec.ts** - Application launch and project selector tests
- **terminal-arithmetic.spec.ts** - Terminal command execution tests
- **terminal-recursive-split.spec.ts** - Terminal splitting functionality tests
- **terminal-split.spec.ts** - Vertical terminal split tests
- **worktree-switch-double-char-bug.spec.ts** - Worktree switching regression tests

## Configuration

The Playwright configuration is defined in `apps/desktop/playwright.config.ts` with:

- Test timeout: 60 seconds
- Workers: 1 (for Electron stability)
- Retry on CI: 2 attempts
- Trace collection on first retry

## Running Tests with UI Mode

For debugging and interactive test development:

```bash
pnpm --filter @vibetree/desktop test:e2e:ui
```

## Running a Single Test

When debugging, you can run a single test file to focus on specific issues:

```bash
# Run a specific test file
pnpm --filter @vibetree/desktop test:e2e path/to/test.spec.ts

# Example: Run only the terminal splitting tests
pnpm --filter @vibetree/desktop test:e2e e2e/terminal-split.spec.ts
```

You can also run a specific test within a file by using Playwright's test filtering:

```bash
# Run tests matching a specific name pattern
pnpm --filter @vibetree/desktop test:e2e --grep "test name pattern"

# Example: Run only tests containing "vertical split"
pnpm --filter @vibetree/desktop test:e2e --grep "vertical split"
```

## Troubleshooting

### Issue: "Process failed to launch!" errors

**Solution:** Run `pnpm fix:electron` to fix the Electron installation.

### Issue: TypeScript compilation errors

**Solution:** Ensure workspace dependencies are built with `pnpm build:deps`.

### Issue: Tests timeout

**Solution:** The default timeout is 60 seconds. For slower systems, you may need to adjust the timeout in `playwright.config.ts`.

## Continuous Integration

The E2E tests are designed to run in CI environments with:

- Automatic retries (2 attempts)
- HTML report generation
- Trace collection for failed tests

## Summary

The complete command sequence for a fresh setup:

```bash
# Install dependencies
pnpm install

# Build workspace packages
pnpm build:deps

# Fix Electron if needed
pnpm fix:electron

# Run E2E tests
pnpm --filter @vibetree/desktop test:e2e
```
