/**
 * Global teardown for Playwright tests
 * This runs after all tests complete to ensure clean shutdown
 *
 * NOTE: Previously this used process.exit(0) to prevent worker teardown timeout,
 * but that masked test failures in CI (tests would always report success).
 * The CI workflow now handles process cleanup externally via pkill commands,
 * so we no longer need to force exit here.
 */
export default async function globalTeardown() {
  console.log('[Global Teardown] Starting cleanup...');

  // Give a moment for any lingering processes to exit naturally
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('[Global Teardown] Cleanup complete');
  // Let Playwright exit naturally with the correct exit code based on test results
}
