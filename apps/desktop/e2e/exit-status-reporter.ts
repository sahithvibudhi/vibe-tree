import type { Reporter, FullResult } from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Custom reporter that writes the test exit status to a temp file.
 * This allows the global teardown to know whether tests passed or failed.
 */
class ExitStatusReporter implements Reporter {
  onEnd(result: FullResult) {
    const exitStatusFile = path.join(__dirname, '.exit-status');
    // Write 0 for passed, 1 for failed/timedOut/interrupted
    const exitCode = result.status === 'passed' ? '0' : '1';
    fs.writeFileSync(exitStatusFile, exitCode);
    console.log(`[ExitStatusReporter] Test result: ${result.status}, exit code: ${exitCode}`);
  }
}

export default ExitStatusReporter;
