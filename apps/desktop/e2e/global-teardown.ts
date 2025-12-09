import * as fs from 'fs';
import * as path from 'path';

/**
 * Global teardown for Playwright tests
 * This runs after all tests complete to ensure clean shutdown
 *
 * We force process.exit() to prevent worker teardown timeout, but we use
 * the exit code from the ExitStatusReporter to correctly report test results.
 */
export default async function globalTeardown() {
  console.log('[Global Teardown] Starting cleanup...');

  // Read the exit status written by ExitStatusReporter
  const exitStatusFile = path.join(__dirname, '.exit-status');
  let exitCode = 0;

  try {
    if (fs.existsSync(exitStatusFile)) {
      const status = fs.readFileSync(exitStatusFile, 'utf-8').trim();
      exitCode = parseInt(status, 10) || 0;
      // Clean up the status file
      fs.unlinkSync(exitStatusFile);
      console.log(`[Global Teardown] Test exit code from reporter: ${exitCode}`);
    } else {
      console.log('[Global Teardown] No exit status file found, assuming success');
    }
  } catch (error) {
    console.error('[Global Teardown] Error reading exit status:', error);
    // If we can't read the status, assume failure to be safe
    exitCode = 1;
  }

  // Give a moment for any lingering processes to exit naturally
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('[Global Teardown] Cleanup complete');
  console.log(`[Global Teardown] Forcing process exit with code ${exitCode} to prevent worker timeout...`);

  // Force exit to prevent worker teardown timeout
  // Use the exit code from the reporter to correctly report test results
  process.exit(exitCode);
}
