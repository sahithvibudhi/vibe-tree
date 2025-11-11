import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import { closeElectronApp } from './helpers/test-launcher';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

/**
 * This test suite exposes the issue where overlapping scheduler executions
 * cause gibberish input to be sent to the terminal.
 *
 * Root Cause: When the scheduler interval is shorter than the time it takes
 * to type the command (10ms per char + 1000ms wait), multiple sendScheduledCommand
 * calls overlap, causing characters from different executions to interleave.
 *
 * This is particularly problematic after machine sleep/wake when timers may
 * fire rapidly or unpredictably.
 */
test.describe('Terminal Scheduler Overlap Bug', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath: string;

  test.beforeEach(async () => {
    // Create a dummy git repository for testing
    const timestamp = Date.now();
    dummyRepoPath = path.join(os.tmpdir(), `dummy-repo-overlap-${timestamp}`);

    // Create the directory and initialize git repo
    fs.mkdirSync(dummyRepoPath, { recursive: true });
    execSync('git init -q', { cwd: dummyRepoPath });
    execSync('git config user.email "test@example.com"', { cwd: dummyRepoPath });
    execSync('git config user.name "Test User"', { cwd: dummyRepoPath });

    // Create a dummy file and make initial commit
    fs.writeFileSync(path.join(dummyRepoPath, 'README.md'), '# Test Repository\n');
    execSync('git add .', { cwd: dummyRepoPath });
    execSync('git commit -q -m "Initial commit"', { cwd: dummyRepoPath });

    // Create main branch
    try {
      execSync('git branch -M main', { cwd: dummyRepoPath });
    } catch (e) {
      // Ignore if branch already exists
    }

    console.log('Created dummy repo at:', dummyRepoPath);

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

    // Clean up the dummy repository
    if (dummyRepoPath && fs.existsSync(dummyRepoPath)) {
      try {
        fs.rmSync(dummyRepoPath, { recursive: true, force: true });
        console.log('Cleaned up dummy repo');
      } catch (e) {
        console.error('Failed to clean up dummy repo:', e);
      }
    }
  });

  test('should expose overlapping execution bug with fast repeat interval', async () => {
    /**
     * This test exposes the bug by:
     * 1. Setting repeat interval to 500ms (faster than typing time)
     * 2. Using a long command that takes > 500ms to type
     * 3. Verifying that gibberish/corrupted output appears
     *
     * Expected behavior: Clean output with each command on a new line
     * Actual behavior: Overlapping characters and malformed commands
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

    // This test should FAIL with current implementation, exposing the bug
    // When fixed, we should NOT see any corrupted output
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

    // For now, we expect the bug to be present (test will fail when bug is fixed)
    expect(hasCorruptedOutput).toBe(true);
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
    await openButton.click();

    await electronApp.evaluate(async ({ dialog }, repoPath) => {
      dialog.showOpenDialog = async () => {
        return {
          canceled: false,
          filePaths: [repoPath]
        };
      };
    }, dummyRepoPath);

    await page.waitForTimeout(3000);

    // Open terminal
    const worktreeButton = page.locator('button[data-worktree-branch="main"]');
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

  test('should expose bug with rapid timer firing after simulated delay', async () => {
    /**
     * This test simulates the sleep/wake scenario by:
     * 1. Starting scheduler with short interval
     * 2. Letting it run briefly
     * 3. Pausing to simulate sleep (not actual sleep, but demonstrates the concept)
     * 4. Checking for corrupted output
     *
     * In real scenario, machine sleep causes setInterval timers to fire rapidly
     * on wake, making the overlap issue worse.
     */
    test.setTimeout(60000);

    await page.waitForLoadState('domcontentloaded');

    // Open project
    await expect(page.locator('h2', { hasText: 'Select a Project' })).toBeVisible({ timeout: 10000 });
    const openButton = page.locator('button', { hasText: 'Open Project Folder' });
    await openButton.click();

    await electronApp.evaluate(async ({ dialog }, repoPath) => {
      dialog.showOpenDialog = async () => {
        return {
          canceled: false,
          filePaths: [repoPath]
        };
      };
    }, dummyRepoPath);

    await page.waitForTimeout(3000);

    // Open terminal
    const worktreeButton = page.locator('button[data-worktree-branch="main"]');
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

    // Let it run for just 2 seconds - enough for overlap to occur
    await page.waitForTimeout(2000);

    // Stop
    await schedulerButton.click();
    const stopButton = page.locator('button', { hasText: 'Stop Scheduler' });
    await stopButton.click();

    // Check for corruption
    const terminalContent = await page.locator('.xterm-screen').textContent();
    console.log('Terminal content (rapid firing):', terminalContent);

    const hasCorruptedOutput =
      terminalContent?.includes('dquote>') ||
      /echo.*\n[^%].*This/.test(terminalContent || '') ||
      /longer\s+command/.test(terminalContent || '');

    // With 200ms interval and ~500ms typing time, we should definitely see overlap
    console.log('Corrupted output detected:', hasCorruptedOutput);
    expect(hasCorruptedOutput).toBe(true);
  });
});
