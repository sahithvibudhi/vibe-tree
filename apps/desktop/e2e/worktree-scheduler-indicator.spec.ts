import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import { closeElectronApp } from './helpers/test-launcher';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Worktree Scheduler Indicator Test', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath: string;

  test.beforeEach(async () => {
    // Create a dummy git repository for testing
    const timestamp = Date.now();
    dummyRepoPath = path.join(os.tmpdir(), `dummy-repo-scheduler-indicator-${timestamp}`);

    // Create the directory and initialize git repo
    fs.mkdirSync(dummyRepoPath, { recursive: true });
    execSync('git init -q', { cwd: dummyRepoPath });
    execSync('git config user.email "test@example.com"', { cwd: dummyRepoPath });
    execSync('git config user.name "Test User"', { cwd: dummyRepoPath });

    // Create a dummy file and make initial commit (required for branches/worktrees)
    fs.writeFileSync(path.join(dummyRepoPath, 'README.md'), '# Test Repository\n');
    execSync('git add .', { cwd: dummyRepoPath });
    execSync('git commit -q -m "Initial commit"', { cwd: dummyRepoPath });

    // Create main branch (some git versions don't create it by default)
    try {
      execSync('git branch -M main', { cwd: dummyRepoPath });
    } catch (e) {
      // Ignore if branch already exists
    }

    console.log('Created dummy repo at:', dummyRepoPath);

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
    if (dummyRepoPath && fs.existsSync(dummyRepoPath)) {
      try {
        fs.rmSync(dummyRepoPath, { recursive: true, force: true });
        console.log('Cleaned up dummy repo');
      } catch (e) {
        console.error('Failed to clean up dummy repo:', e);
      }
    }
  });

  test('should show clock icon in worktree list when scheduler is active', async () => {
    test.setTimeout(60000);

    // Capture console logs from the renderer process
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[WorktreePanel]') || text.includes('[TerminalManager]')) {
        console.log(`[RENDERER] ${text}`);
        consoleLogs.push(text);
      }
    });

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

    // Find the worktree button for main branch
    const worktreeButton = page.locator('button[data-worktree-branch="main"]');
    await expect(worktreeButton).toBeVisible({ timeout: 10000 });

    // Verify there is NO clock icon before starting scheduler
    const clockIconBeforeScheduler = worktreeButton.locator('svg.lucide-clock');
    await expect(clockIconBeforeScheduler).toHaveCount(0);

    // Click the worktree button to open the terminal
    await worktreeButton.click();

    // Wait for the terminal to load
    await page.waitForTimeout(3000);

    // Find and click the scheduler button (Clock icon in terminal header)
    const schedulerButton = page.locator('button[title="Schedule Command"]');
    await expect(schedulerButton).toBeVisible({ timeout: 5000 });
    await schedulerButton.click();

    // Wait for the scheduler dialog to appear
    await expect(page.locator('text=Schedule Terminal Command')).toBeVisible({ timeout: 5000 });

    // Fill in the command
    const commandInput = page.locator('input[id="command"]');
    await expect(commandInput).toBeVisible();
    await commandInput.fill('echo "Scheduler Test"');

    // Fill in the delay (2 seconds to give us time to check)
    const delayInput = page.locator('input[id="delay"]');
    await expect(delayInput).toBeVisible();
    await delayInput.fill('2');

    // Check the repeat checkbox to keep scheduler running
    const repeatCheckbox = page.locator('input[id="repeat"]');
    await repeatCheckbox.check();

    // Click the Start button
    const startButton = page.locator('button', { hasText: 'Start' });
    await expect(startButton).toBeEnabled();
    await startButton.click();

    // Wait for the dialog to close
    await expect(page.locator('text=Schedule Terminal Command')).not.toBeVisible({ timeout: 3000 });

    // Verify the scheduler button in terminal header shows it's running
    await expect(schedulerButton).toHaveClass(/text-blue-500/, { timeout: 2000 });

    // NOW CHECK: The worktree button should have a clock icon
    // Wait a bit for the event to propagate
    await page.waitForTimeout(500);

    // Look for the clock icon inside the worktree button
    const clockIconAfterScheduler = worktreeButton.locator('svg.lucide-clock');

    // Debug: Check what's in the worktree button
    const worktreeButtonHtml = await worktreeButton.innerHTML();
    console.log('Worktree button HTML:', worktreeButtonHtml);

    // Debug: Print all captured console logs
    console.log('=== Console logs from renderer ===');
    consoleLogs.forEach(log => console.log(log));
    console.log('=== End console logs ===');

    // Verify the clock icon is now visible
    await expect(clockIconAfterScheduler).toBeVisible({ timeout: 5000 });

    // Verify the clock icon has blue color
    await expect(clockIconAfterScheduler).toHaveClass(/text-blue-500/);

    // Stop the scheduler
    await schedulerButton.click();
    await expect(page.locator('text=Schedule Terminal Command')).toBeVisible({ timeout: 5000 });
    const stopButton = page.locator('button', { hasText: 'Stop Scheduler' });
    await stopButton.click();

    // Wait for dialog to close and scheduler to stop
    await expect(page.locator('text=Schedule Terminal Command')).not.toBeVisible({ timeout: 3000 });

    // Wait for the event to propagate
    await page.waitForTimeout(500);

    // Verify the clock icon is now gone
    const clockIconAfterStop = worktreeButton.locator('svg.lucide-clock');
    await expect(clockIconAfterStop).toHaveCount(0);

    // Verify scheduler button no longer shows running state
    const buttonClass = await schedulerButton.getAttribute('class');
    expect(buttonClass).not.toContain('text-blue-500');
  });

  test('should handle scheduler indicator with multiple worktrees', async () => {
    test.setTimeout(90000);

    await page.waitForLoadState('domcontentloaded');

    // Open project
    await expect(page.locator('h2', { hasText: 'Select a Project' })).toBeVisible({ timeout: 10000 });
    const openButton = page.locator('button', { hasText: 'Open Project Folder' });

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

    // Create a second worktree
    const addWorktreeButton = page.locator('[data-testid="add-worktree-button"]');
    await expect(addWorktreeButton).toBeVisible();
    await addWorktreeButton.click();

    // Wait for dialog
    await expect(page.locator('text=Create New Feature Branch')).toBeVisible({ timeout: 5000 });

    // Fill in branch name
    const branchInput = page.locator('input[placeholder="feature-name"]');
    await branchInput.fill('test-branch');

    // Click Create
    const createButton = page.locator('button', { hasText: 'Create Branch' });
    await createButton.click();

    // Wait for worktree to be created
    await page.waitForTimeout(3000);

    // Verify we now have two worktrees
    const mainWorktree = page.locator('button[data-worktree-branch="main"]');
    const testWorktree = page.locator('button[data-worktree-branch="test-branch"]');
    await expect(mainWorktree).toBeVisible({ timeout: 10000 });
    await expect(testWorktree).toBeVisible({ timeout: 10000 });

    // Click on main worktree to select it
    await mainWorktree.click();
    await page.waitForTimeout(3000);

    // Start scheduler on main worktree
    const schedulerButton = page.locator('button[title="Schedule Command"]');
    await schedulerButton.click();

    await expect(page.locator('text=Schedule Terminal Command')).toBeVisible({ timeout: 5000 });

    const commandInput = page.locator('input[id="command"]');
    await commandInput.fill('echo "Main Scheduler"');

    const delayInput = page.locator('input[id="delay"]');
    await delayInput.fill('3');

    const repeatCheckbox = page.locator('input[id="repeat"]');
    await repeatCheckbox.check();

    const startButton = page.locator('button', { hasText: 'Start' });
    await startButton.click();

    await page.waitForTimeout(500);

    // Check that main worktree has clock icon
    const mainClockIcon = mainWorktree.locator('svg.lucide-clock');
    await expect(mainClockIcon).toBeVisible({ timeout: 5000 });

    // Check that test-branch worktree does NOT have clock icon
    const testClockIcon = testWorktree.locator('svg.lucide-clock');
    await expect(testClockIcon).toHaveCount(0);

    // Stop scheduler
    await schedulerButton.click();
    await expect(page.locator('text=Schedule Terminal Command')).toBeVisible({ timeout: 5000 });
    const stopButton = page.locator('button', { hasText: 'Stop Scheduler' });
    await stopButton.click();
    await page.waitForTimeout(500);

    // Verify clock icon is gone from main
    await expect(mainClockIcon).toHaveCount(0);
  });
});
