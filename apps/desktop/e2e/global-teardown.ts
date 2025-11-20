/**
 * Global teardown for Playwright tests
 * This runs after all tests complete to ensure clean shutdown
 */
export default async function globalTeardown() {
  console.log('[Global Teardown] Starting cleanup...');

  // Give a moment for any lingering processes to exit naturally
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('[Global Teardown] Cleanup complete');
}
