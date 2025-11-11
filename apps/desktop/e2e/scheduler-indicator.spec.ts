import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import { closeElectronApp } from './helpers/test-launcher';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Scheduler Indicator', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath: string;
  let wt1Path: string;

  test.beforeEach(async () => {
    // Create a dummy git repository with one worktree
    const timestamp = Date.now();
    dummyRepoPath = path.join(os.tmpdir(), `dummy-repo-${timestamp}`);

    // Create the directory and initialize git repo
    fs.mkdirSync(dummyRepoPath, { recursive: true });
    execSync('git init -q', { cwd: dummyRepoPath });
    execSync('git config user.email "test@example.com"', { cwd: dummyRepoPath });
    execSync('git config user.name "Test User"', { cwd: dummyRepoPath });

    // Create a dummy file and make initial commit (required for worktrees)
    fs.writeFileSync(path.join(dummyRepoPath, 'README.md'), '# Test Repository\n');
    execSync('git add .', { cwd: dummyRepoPath });
    execSync('git commit -q -m "Initial commit"', { cwd: dummyRepoPath });

    // Ensure the default branch is named "main"
    try {
      execSync('git branch -M main', { cwd: dummyRepoPath });
    } catch (e) {
      // Ignore if branch already exists
    }

    // Create wt1 worktree directory
    wt1Path = path.join(os.tmpdir(), `dummy-repo-wt1-${timestamp}`);

    // Create wt1 worktree with a new branch
    execSync(`git worktree add -b wt1 "${wt1Path}"`, { cwd: dummyRepoPath });

    console.log('Created dummy repo with main and wt1 branches at:', dummyRepoPath);

    const testMainPath = path.join(__dirname, '../dist/main/test-index.js');
    console.log('Using test main file:', testMainPath);

    electronApp = await electron.launch({
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TEST_MODE: 'true',
        DISABLE_QUIT_DIALOG: 'true'
      },
      args: [testMainPath],
    });

    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  }, 45000);

  test.afterEach(async () => {
    if (electronApp) {
      await closeElectronApp(electronApp);
    }

    // Clean up the worktree directory first
    if (wt1Path && fs.existsSync(wt1Path)) {
      try {
        fs.rmSync(wt1Path, { recursive: true, force: true });
        console.log('Cleaned up wt1 worktree');
      } catch (e) {
        console.error('Failed to clean up wt1 worktree:', e);
      }
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

  test.skip('should show clock icon when scheduler is running and hide it when stopped', async () => {
    test.setTimeout(90000);

    await page.waitForLoadState('domcontentloaded');

    // Verify the app launches with project selector
    await expect(page.locator('h2', { hasText: 'Select a Project' })).toBeVisible({ timeout: 10000 });

    // Click the "Open Project Folder" button
    const openButton = page.locator('button', { hasText: 'Open Project Folder' });
    await expect(openButton).toBeVisible();

    // Mock the Electron dialog to return our dummy repository path
    await electronApp.evaluate(async ({ dialog }, repoPath) => {
      dialog.showOpenDialog = async () => {
        return { canceled: false, filePaths: [repoPath] };
      };
    }, dummyRepoPath);

    // Click to open the project
    await openButton.click();

    // Wait for the project to load and worktrees to be visible
    await page.waitForTimeout(2000);

    // Verify worktree list is visible
    const worktreeList = page.locator('h3', { hasText: 'Worktrees' });
    await expect(worktreeList).toBeVisible({ timeout: 10000 });

    // Find the main worktree button
    const mainWorktreeButton = page.locator('button[data-worktree-branch="main"]');
    await expect(mainWorktreeButton).toBeVisible({ timeout: 5000 });

    // Click on main worktree to select it
    await mainWorktreeButton.click();
    await page.waitForTimeout(1000);

    // Verify terminal is visible
    await expect(page.locator('.xterm-viewport')).toBeVisible({ timeout: 10000 });

    // Initially, there should be NO clock icon before the main worktree name
    const mainWorktreeClockIcon = mainWorktreeButton.locator('svg').filter({ has: page.locator('[class*="lucide-clock"]') });
    await expect(mainWorktreeClockIcon).not.toBeVisible();

    // Find and click the scheduler button (Clock icon in terminal toolbar)
    const schedulerButton = page.locator('button[title="Schedule Command"]');
    await expect(schedulerButton).toBeVisible({ timeout: 5000 });
    await schedulerButton.click();

    // Wait for scheduler dialog to open
    const schedulerDialog = page.locator('[role="dialog"]', { has: page.locator('text=/Schedule Command|Scheduler/i') });
    await expect(schedulerDialog).toBeVisible({ timeout: 5000 });

    // Fill in the scheduler form
    // Find the command input
    const commandInput = schedulerDialog.locator('input[placeholder*="command" i], input[type="text"]').first();
    await commandInput.fill('echo "test"');

    // Set delay to 5 seconds
    const delayInput = schedulerDialog.locator('input[type="number"]').first();
    await delayInput.fill('5');

    // Enable repeat mode
    const repeatCheckbox = schedulerDialog.locator('input[type="checkbox"]').first();
    await repeatCheckbox.check();

    // Click Start button
    const startButton = schedulerDialog.locator('button', { hasText: /Start|Schedule/i });
    await startButton.click();

    // Wait for dialog to close
    await expect(schedulerDialog).not.toBeVisible({ timeout: 5000 });

    // NOW the clock icon should be visible in the worktree list before the main worktree name
    // Give it a moment to update
    await page.waitForTimeout(1000);

    // Check for clock icon in the main worktree button
    const clockIcon = mainWorktreeButton.locator('svg.lucide-clock, [data-lucide="clock"]');
    await expect(clockIcon).toBeVisible({ timeout: 5000 });

    // Verify the clock icon has the blue color class and pulse animation
    const clockIconElement = await clockIcon.elementHandle();
    if (clockIconElement) {
      const classes = await clockIconElement.getAttribute('class');
      expect(classes).toContain('text-blue-500');
      expect(classes).toContain('animate-pulse');
    }

    // Now stop the scheduler
    await schedulerButton.click();
    await expect(schedulerDialog).toBeVisible({ timeout: 5000 });

    // Click Stop button
    const stopButton = schedulerDialog.locator('button', { hasText: /Stop/i });
    await expect(stopButton).toBeVisible();
    await stopButton.click();

    // Wait for dialog to close
    await expect(schedulerDialog).not.toBeVisible({ timeout: 5000 });

    // Clock icon should disappear
    await page.waitForTimeout(1000);
    await expect(clockIcon).not.toBeVisible();
  });

  test.skip('should show clock icon when any split has a running scheduler', async () => {
    test.setTimeout(90000);

    await page.waitForLoadState('domcontentloaded');

    // Open project
    await expect(page.locator('h2', { hasText: 'Select a Project' })).toBeVisible({ timeout: 10000 });
    const openButton = page.locator('button', { hasText: 'Open Project Folder' });
    await expect(openButton).toBeVisible();

    await electronApp.evaluate(async ({ dialog }, repoPath) => {
      dialog.showOpenDialog = async () => {
        return { canceled: false, filePaths: [repoPath] };
      };
    }, dummyRepoPath);

    await openButton.click();
    await page.waitForTimeout(2000);

    // Select main worktree
    const mainWorktreeButton = page.locator('button[data-worktree-branch="main"]');
    await expect(mainWorktreeButton).toBeVisible({ timeout: 5000 });
    await mainWorktreeButton.click();
    await page.waitForTimeout(1000);

    // Wait for terminal to be visible
    await expect(page.locator('.xterm-viewport')).toBeVisible({ timeout: 10000 });

    // Split the terminal vertically
    const splitVerticalButton = page.locator('button[title*="Split" i]').first();
    await expect(splitVerticalButton).toBeVisible({ timeout: 5000 });
    await splitVerticalButton.click();
    await page.waitForTimeout(1000);

    // Start scheduler in one of the splits
    const schedulerButtons = page.locator('button[title="Schedule Command"]');
    const firstSchedulerButton = schedulerButtons.first();
    await firstSchedulerButton.click();

    const schedulerDialog = page.locator('[role="dialog"]', { has: page.locator('text=/Schedule Command|Scheduler/i') });
    await expect(schedulerDialog).toBeVisible({ timeout: 5000 });

    const commandInput = schedulerDialog.locator('input[placeholder*="command" i], input[type="text"]').first();
    await commandInput.fill('echo "test"');

    const delayInput = schedulerDialog.locator('input[type="number"]').first();
    await delayInput.fill('5');

    const repeatCheckbox = schedulerDialog.locator('input[type="checkbox"]').first();
    await repeatCheckbox.check();

    const startButton = schedulerDialog.locator('button', { hasText: /Start|Schedule/i });
    await startButton.click();
    await expect(schedulerDialog).not.toBeVisible({ timeout: 5000 });

    // Clock icon should be visible even though scheduler is only in one split
    await page.waitForTimeout(1000);
    const clockIcon = mainWorktreeButton.locator('svg.lucide-clock, [data-lucide="clock"]');
    await expect(clockIcon).toBeVisible({ timeout: 5000 });
  });
});
