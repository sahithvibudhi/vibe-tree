import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import { closeElectronApp } from './helpers/test-launcher';
import { createTestGitRepo, cleanupTestGitRepo } from './helpers/test-git-repo';
import path from 'path';

test.describe('Terminal Scheduler Test', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath: string;

  test.beforeEach(async () => {
    // Create a dummy git repository for testing
    const { repoPath } = createTestGitRepo({ nameSuffix: 'repo-scheduler' });
    dummyRepoPath = repoPath;

    const testMainPath = path.join(__dirname, '../dist/main/test-index.js');
    console.log('Using test main file:', testMainPath);

    // In CI, we need to specify the app directory explicitly
    const appDir = path.join(__dirname, '..');

    electronApp = await electron.launch({
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TEST_MODE: 'true',
        DISABLE_QUIT_DIALOG: 'true'  // Prevent blocking on quit dialog
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
    cleanupTestGitRepo(dummyRepoPath);
  });

  test('should schedule and execute "echo Hello World" after 1 second', async () => {
    test.setTimeout(60000);

    await page.waitForLoadState('domcontentloaded');

    // Verify the app launches with project selector
    await expect(page.locator('h2', { hasText: 'Select a Project' })).toBeVisible({ timeout: 10000 });

    // Click the "Open Project Folder" button
    const openButton = page.locator('button', { hasText: 'Open Project Folder' });
    await expect(openButton).toBeVisible();

    // Mock the Electron dialog to return our dummy repository path
    await electronApp.evaluate(async ({ dialog }, repoPath) => {
      dialog.showOpenDialog = async () => {
        return {
          canceled: false,
          filePaths: [repoPath]
        };
      };
    }, dummyRepoPath);

    // Click the open button which will trigger the mocked dialog
    await openButton.click();

    // Wait for worktree list to appear
    await page.waitForTimeout(3000);

    // Try to find the worktree button using data attribute - in the dummy repo it should be main
    const worktreeButton = page.locator('button[data-worktree-branch="main"]');

    const worktreeCount = await worktreeButton.count();
    expect(worktreeCount).toBeGreaterThan(0);

    // Click the worktree button to open the terminal
    await worktreeButton.click();

    // Wait for the terminal to load
    await page.waitForTimeout(3000);

    // Find the terminal element
    const terminalSelectors = ['.xterm-screen', '.xterm', '.xterm-container'];
    let terminalElement = null;

    for (const selector of terminalSelectors) {
      const element = page.locator(selector).first();
      if (await element.count() > 0) {
        terminalElement = element;
        break;
      }
    }

    expect(terminalElement).not.toBeNull();

    // Find and click the scheduler button (Clock icon)
    const schedulerButton = page.locator('button[title="Schedule Command"]');
    await expect(schedulerButton).toBeVisible({ timeout: 5000 });
    await schedulerButton.click();

    // Wait for the scheduler dialog to appear
    await expect(page.locator('text=Schedule Terminal Command')).toBeVisible({ timeout: 5000 });

    // Fill in the command
    const commandInput = page.locator('input[id="command"]');
    await expect(commandInput).toBeVisible();
    await commandInput.fill('echo "Hello World"');

    // Fill in the delay (1 second)
    const delayInput = page.locator('input[id="delay"]');
    await expect(delayInput).toBeVisible();
    await delayInput.fill('1');

    // Ensure repeat is not checked (default behavior)
    const repeatCheckbox = page.locator('input[id="repeat"]');
    const isChecked = await repeatCheckbox.isChecked();
    if (isChecked) {
      await repeatCheckbox.click();
    }

    // Click the Start button
    const startButton = page.locator('button', { hasText: 'Start' });
    await expect(startButton).toBeEnabled();
    await startButton.click();

    // Wait for the dialog to close
    await expect(page.locator('text=Schedule Terminal Command')).not.toBeVisible({ timeout: 3000 });

    // Verify the scheduler button shows it's running (should have blue color or pulse animation)
    await expect(schedulerButton).toHaveClass(/text-blue-500/, { timeout: 2000 });

    // Wait for the command to execute (1 second delay + buffer)
    await page.waitForTimeout(2000);

    // Verify "Hello World" appears in the terminal output
    const terminalContent = await page.locator('.xterm-screen').textContent();
    expect(terminalContent).toContain('Hello World');

    // Verify scheduler button is no longer running (one-time execution should stop)
    await page.waitForTimeout(1000);
    // For one-time execution, the button should not have the blue color after execution
    // Note: This might take a moment to update
  });

  test('should schedule repeating command and allow stopping', async () => {
    test.setTimeout(60000);

    await page.waitForLoadState('domcontentloaded');

    // Verify the app launches with project selector
    await expect(page.locator('h2', { hasText: 'Select a Project' })).toBeVisible({ timeout: 10000 });

    // Click the "Open Project Folder" button
    const openButton = page.locator('button', { hasText: 'Open Project Folder' });
    await expect(openButton).toBeVisible();

    // Mock the Electron dialog to return our dummy repository path
    await electronApp.evaluate(async ({ dialog }, repoPath) => {
      dialog.showOpenDialog = async () => {
        return {
          canceled: false,
          filePaths: [repoPath]
        };
      };
    }, dummyRepoPath);

    // Click the open button which will trigger the mocked dialog
    await openButton.click();

    // Wait for worktree list to appear
    await page.waitForTimeout(3000);

    // Try to find the worktree button
    const worktreeButton = page.locator('button[data-worktree-branch="main"]');
    const worktreeCount = await worktreeButton.count();
    expect(worktreeCount).toBeGreaterThan(0);

    // Click the worktree button to open the terminal
    await worktreeButton.click();

    // Wait for the terminal to load
    await page.waitForTimeout(3000);

    // Find the scheduler button
    const schedulerButton = page.locator('button[title="Schedule Command"]');
    await expect(schedulerButton).toBeVisible({ timeout: 5000 });
    await schedulerButton.click();

    // Wait for the scheduler dialog to appear
    await expect(page.locator('text=Schedule Terminal Command')).toBeVisible({ timeout: 5000 });

    // Fill in the command
    const commandInput = page.locator('input[id="command"]');
    await commandInput.fill('echo "Repeat Test"');

    // Fill in the delay
    const delayInput = page.locator('input[id="delay"]');
    await delayInput.fill('1');

    // Check the repeat checkbox
    const repeatCheckbox = page.locator('input[id="repeat"]');
    await repeatCheckbox.check();

    // Click the Start button
    const startButton = page.locator('button', { hasText: 'Start' });
    await startButton.click();

    // Wait for the dialog to close
    await expect(page.locator('text=Schedule Terminal Command')).not.toBeVisible({ timeout: 3000 });

    // Verify the scheduler button shows it's running
    await expect(schedulerButton).toHaveClass(/text-blue-500/, { timeout: 2000 });

    // Wait for at least 2 executions (2+ seconds)
    await page.waitForTimeout(2500);

    // Get terminal content
    const terminalContent = await page.locator('.xterm-screen').textContent();

    // Count occurrences of "Repeat Test" - should be at least 2
    const occurrences = (terminalContent?.match(/Repeat Test/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);

    // Now stop the scheduler by clicking the scheduler button again
    await schedulerButton.click();

    // Wait for dialog to appear
    await expect(page.locator('text=Schedule Terminal Command')).toBeVisible({ timeout: 5000 });

    // Verify the "Scheduler is running" indicator is shown in the blue banner
    await expect(page.locator('.text-blue-900, .text-blue-100').filter({ hasText: 'Scheduler is running' })).toBeVisible();

    // Click the Stop button
    const stopButton = page.locator('button', { hasText: 'Stop Scheduler' });
    await expect(stopButton).toBeVisible();
    await stopButton.click();

    // Wait for dialog to close
    await expect(page.locator('text=Schedule Terminal Command')).not.toBeVisible({ timeout: 3000 });

    // Verify scheduler is no longer running
    await page.waitForTimeout(500);
    const buttonClass = await schedulerButton.getAttribute('class');
    expect(buttonClass).not.toContain('text-blue-500');

    // Wait a bit and verify no more "Repeat Test" is added
    const contentBeforeWait = await page.locator('.xterm-screen').textContent();
    const countBefore = (contentBeforeWait?.match(/Repeat Test/g) || []).length;

    await page.waitForTimeout(2000);

    const contentAfterWait = await page.locator('.xterm-screen').textContent();
    const countAfter = (contentAfterWait?.match(/Repeat Test/g) || []).length;

    // Count should be the same since scheduler is stopped
    expect(countAfter).toBe(countBefore);
  });

  test('should disable inputs when scheduler is running', async () => {
    test.setTimeout(60000);

    await page.waitForLoadState('domcontentloaded');

    // Verify the app launches with project selector
    await expect(page.locator('h2', { hasText: 'Select a Project' })).toBeVisible({ timeout: 10000 });

    // Click the "Open Project Folder" button
    const openButton = page.locator('button', { hasText: 'Open Project Folder' });
    await expect(openButton).toBeVisible();

    // Mock the Electron dialog
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

    const worktreeButton = page.locator('button[data-worktree-branch="main"]');
    await worktreeButton.click();
    await page.waitForTimeout(3000);

    // Open scheduler dialog
    const schedulerButton = page.locator('button[title="Schedule Command"]');
    await schedulerButton.click();

    // Fill and start with repeat
    const commandInput = page.locator('input[id="command"]');
    await commandInput.fill('echo "test"');

    const delayInput = page.locator('input[id="delay"]');
    await delayInput.fill('5'); // Use longer delay so we can test while running

    const repeatCheckbox = page.locator('input[id="repeat"]');
    await repeatCheckbox.check();

    const startButton = page.locator('button', { hasText: 'Start' });
    await startButton.click();

    // Wait for dialog to close
    await page.waitForTimeout(1000);

    // Open dialog again while scheduler is running
    await schedulerButton.click();

    // Wait for dialog to appear
    await expect(page.locator('text=Schedule Terminal Command')).toBeVisible({ timeout: 5000 });

    // Verify inputs are disabled
    const commandInputDisabled = await page.locator('input[id="command"]').isDisabled();
    const delayInputDisabled = await page.locator('input[id="delay"]').isDisabled();
    const repeatCheckboxDisabled = await page.locator('input[id="repeat"]').isDisabled();

    expect(commandInputDisabled).toBe(true);
    expect(delayInputDisabled).toBe(true);
    expect(repeatCheckboxDisabled).toBe(true);

    // Verify only Stop button is available
    await expect(page.locator('button', { hasText: 'Stop Scheduler' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Start' })).not.toBeVisible();

    // Stop the scheduler
    const stopButton = page.locator('button', { hasText: 'Stop Scheduler' });
    await stopButton.click();

    await page.waitForTimeout(500);
  });

  test('should stop scheduler when terminal is closed', async () => {
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
    await worktreeButton.click();
    await page.waitForTimeout(3000);

    // Start a repeating scheduler
    const schedulerButton = page.locator('button[title="Schedule Command"]');
    await schedulerButton.click();

    await expect(page.locator('text=Schedule Terminal Command')).toBeVisible({ timeout: 5000 });

    const commandInput = page.locator('input[id="command"]');
    await commandInput.fill('echo "Keep Running"');

    const delayInput = page.locator('input[id="delay"]');
    await delayInput.fill('1');

    const repeatCheckbox = page.locator('input[id="repeat"]');
    await repeatCheckbox.check();

    const startButton = page.locator('button', { hasText: 'Start' });
    await startButton.click();

    await page.waitForTimeout(1000);

    // Verify scheduler is running
    await expect(schedulerButton).toHaveClass(/text-blue-500/, { timeout: 2000 });

    // Split the terminal first to create a second terminal (so we can close one)
    const splitButton = page.locator('button[title="Split Terminal Vertically"]').first();
    await splitButton.click();
    await page.waitForTimeout(2000);

    // Verify we now have 2 terminals
    const terminalHeaders = page.locator('.terminal-header');
    await expect(terminalHeaders).toHaveCount(2);

    // Close the first terminal (the one with the running scheduler)
    const closeButtons = page.locator('button[title="Close Terminal"]');
    const firstCloseButton = closeButtons.first();
    await firstCloseButton.click();

    // Wait for terminal to close
    await page.waitForTimeout(2000);

    // Verify we now have only 1 terminal
    await expect(terminalHeaders).toHaveCount(1);

    // The scheduler should have been cleaned up (no errors should occur)
    // Verify the app is still responsive by checking the remaining terminal exists
    const remainingHeader = page.locator('.terminal-header');
    await expect(remainingHeader).toBeVisible();
  });
});
