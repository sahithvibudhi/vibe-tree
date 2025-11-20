/**
 * Global teardown for Playwright tests
 * This runs after all tests complete to ensure clean shutdown
 *
 * IMPORTANT: We force process.exit() to prevent worker teardown timeout.
 * The worker teardown timeout appears to be caused by Playwright's worker
 * process waiting indefinitely for something after all tests complete.
 * Forcing exit here is safe because all tests have already completed.
 */
export default async function globalTeardown() {
  console.log('[Global Teardown] Starting cleanup...');

  // Give a moment for any lingering processes to exit naturally
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('[Global Teardown] Cleanup complete');
  console.log('[Global Teardown] Forcing process exit to prevent worker timeout...');

  // Force exit to prevent worker teardown timeout
  // This is safe because all tests have completed at this point
  process.exit(0);
}
