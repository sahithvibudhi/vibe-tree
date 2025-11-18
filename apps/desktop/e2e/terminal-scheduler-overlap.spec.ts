import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import { closeElectronApp } from './helpers/test-launcher';
import path from 'path';
import { createTestGitRepo, cleanupTestGitRepo } from './helpers/test-git-repo';

/**
 * This test suite verifies that the scheduler overlap bug has been fixed.
 *
 * Previous Bug: When the scheduler interval was shorter than the time it takes
 * to type the command (10ms per char + 1000ms wait), multiple sendScheduledCommand
 * calls would overlap, causing characters from different executions to interleave.
 *
 * Fix: Added concurrency protection with commandInProgressRef flag and changed
 * from setInterval to chained setTimeout. Commands now only execute serially.
 *
 * These tests verify the fix works even in extreme cases (fast intervals, machine
 * sleep/wake scenarios).
 */
test.describe('Terminal Scheduler Overlap Fix Verification', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath: string;

  test.beforeEach(async () => {
    const { repoPath } = createTestGitRepo({ nameSuffix: 'repo-overlap' });
    dummyRepoPath = repoPath;

    const testMainPath = path.join(__dirname, '../dist/main/test-index.js');
    const appDir = path.join(__dirname, '..');

    electronApp = await electron.launch({
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TEST_MODE: 'true',
        DISABLE_QUIT_DIALOG: 'true'
      },
      args: [testMainPath],
      cwd: appDir,
    });

    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  }, 45000);

  test.afterEach(async () => {
    if (electronApp) {
      await closeElectronApp(electronApp);
    }

    cleanupTestGitRepo(dummyRepoPath);
  });

  test('should prevent overlapping execution even with fast repeat interval', async () => {
    /**
     * This test verifies the fix by:
     * 1. Setting repeat interval to 500ms (faster than typing time)
     * 2. Using a command that takes > 500ms to type
     * 3. Verifying that NO corrupted output appears despite fast interval
     *
     * With the fix: Clean output because concurrency protection prevents overlap
     * Without the fix: Would have overlapping characters and malformed commands
     */
    test.setTimeout(60000);

    await page.waitForLoadState('domcontentloaded');

    // Open project
    await expect(page.locator('h2', { hasText: 'Select a Project' })).toBeVisible({ timeout: 10000 });
    const openButton = page.locator('button', { hasText: 'Open Project Folder' });
    await expect(openButton).toBeVisible();

    await electronApp.evaluate(async ({ dialog }, repoPath) => {
      dialog.showOpenDialog = async () => {
        return {
          canceled: false,
          filePaths: [repoPath]
        };
      };
    }, dummyRepoPath);

    await openButton.click();
    await page.waitForTimeout(3000);

    // Open terminal
    const worktreeButton = page.locator('button[data-worktree-branch="main"]');
    const worktreeCount = await worktreeButton.count();
    expect(worktreeCount).toBeGreaterThan(0);
    await worktreeButton.click();
    await page.waitForTimeout(3000);

    // Find the scheduler button
    const schedulerButton = page.locator('button[title="Schedule Command"]');
    await expect(schedulerButton).toBeVisible({ timeout: 5000 });
    await schedulerButton.click();

    // Wait for the scheduler dialog
    await expect(page.locator('text=Schedule Terminal Command')).toBeVisible({ timeout: 5000 });

    // Use a command that takes significant time to type
    // echo "Hello World" = 18 chars * 10ms = 180ms + 1000ms wait = 1180ms total
    const commandInput = page.locator('input[id="command"]');
    await commandInput.fill('echo "Hello World"');

    // Set repeat interval to 500ms (much faster than typing time)
    // This will cause overlapping executions
    const delayInput = page.locator('input[id="delay"]');
    await delayInput.fill('0.5'); // 500ms

    // Enable repeat
    const repeatCheckbox = page.locator('input[id="repeat"]');
    await repeatCheckbox.check();

    // Start the scheduler
    const startButton = page.locator('button', { hasText: 'Start' });
    await startButton.click();

    // Wait for dialog to close
    await expect(page.locator('text=Schedule Terminal Command')).not.toBeVisible({ timeout: 3000 });

    // Verify scheduler is running
    await expect(schedulerButton).toHaveClass(/text-blue-500/, { timeout: 2000 });

    // Wait for several executions to occur (let the bug manifest)
    await page.waitForTimeout(5000);

    // Stop the scheduler
    await schedulerButton.click();
    await expect(page.locator('text=Schedule Terminal Command')).toBeVisible({ timeout: 5000 });
    const stopButton = page.locator('button', { hasText: 'Stop Scheduler' });
    await stopButton.click();
    await expect(page.locator('text=Schedule Terminal Command')).not.toBeVisible({ timeout: 3000 });

    // Get terminal content
    const terminalContent = await page.locator('.xterm-screen').textContent();
    console.log('Terminal content:', terminalContent);

    // Check for signs of corrupted output:
    // 1. Incomplete quotes (dquote> prompt from shell)
    // 2. Commands split across lines
    // 3. Missing closing quotes
    // 4. Characters appearing in wrong order

    const hasCorruptedOutput =
      terminalContent?.includes('dquote>') || // Shell waiting for closing quote
      /echo.*\n[^%].*Hello/.test(terminalContent || '') || // Command split across lines
      /Hello Wor\s+ld/.test(terminalContent || ''); // Split word

    // The fix prevents overlapping executions, so we should NOT see corrupted output
    if (hasCorruptedOutput) {
      console.error('BUG DETECTED: Overlapping scheduler executions caused corrupted terminal input!');
      console.error('Signs of corruption:');
      if (terminalContent?.includes('dquote>')) {
        console.error('  - Found "dquote>" indicating unclosed quote');
      }
      if (/echo.*\n[^%].*Hello/.test(terminalContent || '')) {
        console.error('  - Found command split across lines');
      }
      if (/Hello Wor\s+ld/.test(terminalContent || '')) {
        console.error('  - Found split word (Hello Wor...ld)');
      }
    }

    // With the fix, we expect clean output (no corruption)
    expect(hasCorruptedOutput).toBe(false);
  });

  test('should show clean output when interval is longer than typing time', async () => {
    /**
     * This test demonstrates correct behavior when the interval is long enough
     * to allow each command to complete before the next one starts.
     */
    test.setTimeout(60000);

    await page.waitForLoadState('domcontentloaded');

    // Open project
    await expect(page.locator('h2', { hasText: 'Select a Project' })).toBeVisible({ timeout: 10000 });
    const openButton = page.locator('button', { hasText: 'Open Project Folder' });
    await expect(openButton).toBeVisible();

    await electronApp.evaluate(async ({ dialog }, repoPath) => {
      dialog.showOpenDialog = async () => {
        return {
          canceled: false,
          filePaths: [repoPath]
        };
      };
    }, dummyRepoPath);

    await openButton.click();
    await page.waitForTimeout(3000);

    // Open terminal
    const worktreeButton = page.locator('button[data-worktree-branch="main"]');
    const worktreeCount = await worktreeButton.count();
    expect(worktreeCount).toBeGreaterThan(0);
    await worktreeButton.click();
    await page.waitForTimeout(3000);

    // Open scheduler
    const schedulerButton = page.locator('button[title="Schedule Command"]');
    await schedulerButton.click();
    await expect(page.locator('text=Schedule Terminal Command')).toBeVisible({ timeout: 5000 });

    // Same command as before
    const commandInput = page.locator('input[id="command"]');
    await commandInput.fill('echo "Hello World"');

    // Set interval to 2 seconds (longer than typing time of ~1.2 seconds)
    const delayInput = page.locator('input[id="delay"]');
    await delayInput.fill('2');

    // Enable repeat
    const repeatCheckbox = page.locator('input[id="repeat"]');
    await repeatCheckbox.check();

    // Start
    const startButton = page.locator('button', { hasText: 'Start' });
    await startButton.click();
    await expect(page.locator('text=Schedule Terminal Command')).not.toBeVisible({ timeout: 3000 });

    // Wait for several executions
    await page.waitForTimeout(6000);

    // Stop scheduler
    await schedulerButton.click();
    const stopButton = page.locator('button', { hasText: 'Stop Scheduler' });
    await stopButton.click();

    // Check terminal content
    const terminalContent = await page.locator('.xterm-screen').textContent();
    console.log('Terminal content (clean):', terminalContent);

    // Should have multiple "Hello World" outputs
    const occurrences = (terminalContent?.match(/Hello World/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);

    // Should NOT have corrupted output
    expect(terminalContent).not.toContain('dquote>');
    expect(terminalContent).not.toMatch(/Hello Wor\s+ld/);
  });

  // This test verifies that the scheduler works correctly even with very short intervals
  // by using a dynamic ENTER key delay of min(delayMs/2, 1000). For 200ms intervals,
  // the ENTER key delay is 100ms, allowing the command to complete faster and preventing
  // overlap issues.
  test('should prevent corruption even with very short interval (200ms)', async () => {
    /**
     * This test verifies the fix handles extreme cases:
     * 1. Starting scheduler with very short interval (200ms)
     * 2. Using a longer command (~500ms typing time)
     * 3. Verifying NO corruption despite massive interval vs. typing time mismatch
     *
     * This simulates worst-case scenarios like machine sleep/wake where timers
     * might fire rapidly. The fix prevents corruption via concurrency protection.
     */
    test.setTimeout(60000);

    await page.waitForLoadState('domcontentloaded');

    // Open project
    await expect(page.locator('h2', { hasText: 'Select a Project' })).toBeVisible({ timeout: 10000 });
    const openButton = page.locator('button', { hasText: 'Open Project Folder' });
    await expect(openButton).toBeVisible();

    await electronApp.evaluate(async ({ dialog }, repoPath) => {
      dialog.showOpenDialog = async () => {
        return {
          canceled: false,
          filePaths: [repoPath]
        };
      };
    }, dummyRepoPath);

    await openButton.click();
    await page.waitForTimeout(3000);

    // Open terminal
    const worktreeButton = page.locator('button[data-worktree-branch="main"]');
    const worktreeCount = await worktreeButton.count();
    expect(worktreeCount).toBeGreaterThan(0);
    await worktreeButton.click();
    await page.waitForTimeout(3000);

    // Open scheduler
    const schedulerButton = page.locator('button[title="Schedule Command"]');
    await schedulerButton.click();
    await expect(page.locator('text=Schedule Terminal Command')).toBeVisible({ timeout: 5000 });

    // Use a longer command to increase typing time
    const commandInput = page.locator('input[id="command"]');
    await commandInput.fill('echo "This is a longer command to test overlap"');

    // Very short interval - 200ms
    const delayInput = page.locator('input[id="delay"]');
    await delayInput.fill('0.2');

    // Enable repeat
    const repeatCheckbox = page.locator('input[id="repeat"]');
    await repeatCheckbox.check();

    // Start
    const startButton = page.locator('button', { hasText: 'Start' });
    await startButton.click();
    await expect(page.locator('text=Schedule Terminal Command')).not.toBeVisible({ timeout: 3000 });

    // Let it run for 2.2 seconds - enough to complete 3 full iterations without catching mid-execution
    // With 200ms interval + ~570ms command time = ~770ms per iteration
    // 2200ms allows 2-3 complete iterations plus a safety buffer
    await page.waitForTimeout(2200);

    // Stop
    await schedulerButton.click();
    const stopButton = page.locator('button', { hasText: 'Stop Scheduler' });
    await stopButton.click();

    // Wait for the stop scheduler dialog to close, ensuring any in-progress command completes
    await expect(page.locator('text=Schedule Terminal Command')).not.toBeVisible({ timeout: 3000 });

    // Additional wait to ensure terminal output is fully rendered
    await page.waitForTimeout(200);

    // Check for corruption
    const terminalContent = await page.locator('.xterm-screen').textContent();
    console.log('Terminal content (rapid firing):', terminalContent);

    // Check for actual corruption patterns:
    // 1. Shell waiting for closing quote (dquote>)
    // 2. Command split mid-word across lines (like "This\nis a longer" instead of complete output)
    // 3. Words split with excessive whitespace in the middle (more than 1 space)
    const hasDquote = terminalContent?.includes('dquote>') || false;
    const hasSplitCommand = /echo "This is a longer\s*\n(?!This is a longer command to test overlap)/.test(terminalContent || '');
    const hasExtraSpaces = /longer\s{2,}command/.test(terminalContent || ''); // 2 or more spaces

    const hasCorruptedOutput = hasDquote || hasSplitCommand || hasExtraSpaces;

    // With the fix, even with 200ms interval and ~500ms typing time,
    // we should NOT see overlap due to concurrency protection
    console.log('Corrupted output detected:', hasCorruptedOutput);
    if (hasCorruptedOutput) {
      console.log('  - dquote:', hasDquote);
      console.log('  - split command:', hasSplitCommand);
      console.log('  - extra spaces:', hasExtraSpaces);
    }
    expect(hasCorruptedOutput).toBe(false);
  });
});
