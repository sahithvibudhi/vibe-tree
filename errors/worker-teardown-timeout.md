# Worker Teardown Timeout Issue

## Issue Details
- **GitHub Actions Run**: 19495621515
- **Job ID**: 55797011388
- **Job Name**: E2E Tests
- **Branch**: fix-broken-app-launch

## Error Message
```
Worker teardown timeout of 120000ms exceeded.
```

## Test Results
- 46 tests passed
- All tests completed successfully
- Error occurred AFTER all tests finished during worker teardown phase

## Timeline
- Last test completed: 2025-11-19T09:10:02
- Worker teardown timeout: 2025-11-19T09:12:02
- Timeout duration: Exactly 120 seconds (the configured timeout)

## Root Cause Analysis

The issue is that after all 46 tests completed successfully, Playwright's worker teardown process hung for the full 120-second timeout period before failing. This indicates that:

1. **The tests themselves are passing** - all 46 tests completed successfully
2. **Cleanup is hanging** - something during worker teardown is not completing
3. **Process.exit() cleanup issue** - The `closeElectronApp` function uses `process.exit(0)` to quickly close Electron, which may leave resources in an inconsistent state

Looking at the test-launcher helper (`apps/desktop/e2e/helpers/test-launcher.ts:41-52`), the `closeElectronApp` function intentionally uses `process.exit(0)` to avoid slow cleanup:

```typescript
export async function closeElectronApp(electronApp: ElectronApplication | null): Promise<void> {
  if (!electronApp) {
    return;
  }

  try {
    await electronApp.evaluate(() => process.exit(0));
  } catch (error) {
    // Ignore errors - process.exit(0) will close the connection immediately
    // which causes Playwright to throw, but that's expected and OK
  }
}
```

However, this aggressive cleanup approach may be leaving Playwright worker resources in a state that prevents clean teardown.

## Potential Causes

1. **Playwright worker cleanup**
   - When using `workers: 1` (as configured), Playwright needs to clean up the worker process
   - The worker may be waiting for Electron processes to fully terminate
   - Using `process.exit(0)` bypasses normal cleanup, possibly leaving:
     - File descriptors open
     - Child processes running
     - Event listeners attached
     - Playwright connections in an inconsistent state

2. **Forked PTY processes**
   - The codebase uses a fork-per-terminal architecture
   - PTY child processes may not be properly terminated when using `process.exit(0)`
   - Worker teardown may be waiting for these child processes to exit

3. **CI-specific issue**
   - This only fails in CI (GitHub Actions)
   - Local runs may have different timeout behavior or process cleanup
   - Container environment may handle process termination differently

## Proposed Solutions

### Option 1: Add proper worker teardown hook
Add a `globalTeardown` or `testDir` level teardown to ensure all Electron instances are properly closed:

```typescript
// playwright.config.ts
export default defineConfig({
  // ... existing config
  globalTeardown: './e2e/global-teardown.ts',
});

// e2e/global-teardown.ts
export default async function globalTeardown() {
  // Ensure all child processes are killed
  // Add small delay to allow cleanup
  await new Promise(resolve => setTimeout(resolve, 1000));
}
```

### Option 2: Replace process.exit() with proper cleanup
Instead of using `process.exit(0)`, implement proper cleanup:

```typescript
export async function closeElectronApp(electronApp: ElectronApplication | null): Promise<void> {
  if (!electronApp) {
    return;
  }

  try {
    // First, close all windows
    await electronApp.evaluate(async ({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(win => win.destroy());
    });

    // Then close the app properly
    await electronApp.close();
  } catch (error) {
    console.error('Error closing Electron app:', error);
    // Fallback to process.exit if normal close fails
    try {
      await electronApp.evaluate(() => process.exit(0));
    } catch {
      // Ignore
    }
  }
}
```

### Option 3: Increase worker teardown timeout for CI only
As a temporary workaround, increase the timeout for CI:

```typescript
export default defineConfig({
  // ... existing config
  timeout: process.env.CI ? 180000 : 120000, // 3 minutes in CI
});
```

## Recommended Fix

**Implement Option 2** (proper cleanup) as it addresses the root cause. The current `process.exit(0)` approach is causing incomplete cleanup that manifests as worker teardown hangs in CI.

## Test Plan
1. Implement proper cleanup in `closeElectronApp`
2. Run tests locally to verify they still pass
3. Push to PR and verify CI passes
4. Monitor for worker teardown timeout errors
