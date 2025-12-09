import type { Reporter, FullResult } from '@playwright/test/reporter';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Use a fixed path in temp directory to avoid __dirname issues
const EXIT_STATUS_FILE = path.join(os.tmpdir(), 'playwright-exit-status');

/**
 * Custom reporter that writes the test exit status to a temp file.
 * This allows the global teardown to know whether tests passed or failed.
 */
class ExitStatusReporter implements Reporter {
  onEnd(result: FullResult) {
    // Write 0 for passed, 1 for failed/timedOut/interrupted
    const exitCode = result.status === 'passed' ? '0' : '1';
    try {
      fs.writeFileSync(EXIT_STATUS_FILE, exitCode);
      console.log(`[ExitStatusReporter] Test result: ${result.status}, exit code: ${exitCode}`);
      console.log(`[ExitStatusReporter] Written to: ${EXIT_STATUS_FILE}`);
    } catch (error) {
      console.error(`[ExitStatusReporter] Failed to write exit status: ${error}`);
    }
  }
}

export default ExitStatusReporter;

// Export the path so global teardown can use it
export { EXIT_STATUS_FILE };
