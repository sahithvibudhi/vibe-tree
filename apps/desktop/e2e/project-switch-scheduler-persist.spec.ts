import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import { closeElectronApp } from './helpers/test-launcher';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Project Switch Scheduler Persistence Test', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath1: string;
  let dummyRepoPath2: string;

  test.beforeEach(async () => {
    // Create two dummy git repositories for testing
    const timestamp = Date.now();
    dummyRepoPath1 = path.join(os.tmpdir(), `dummy-repo-1-${timestamp}`);
    dummyRepoPath2 = path.join(os.tmpdir(), `dummy-repo-2-${timestamp}`);

    // Helper function to create a git repo
    const createRepo = (repoPath: string) => {
      fs.mkdirSync(repoPath, { recursive: true });
      execSync('git init -q', { cwd: repoPath });
      execSync('git config user.email "test@example.com"', { cwd: repoPath });
      execSync('git config user.name "Test User"', { cwd: repoPath });
      fs.writeFileSync(path.join(repoPath, 'README.md'), `# Test Repository ${repoPath}\n`);
      execSync('git add .', { cwd: repoPath });
      execSync('git commit -q -m "Initial commit"', { cwd: repoPath });
      try {
        execSync('git branch -M main', { cwd: repoPath });
      } catch (e) {
        // Ignore if branch already exists
      }
    };

    createRepo(dummyRepoPath1);
    createRepo(dummyRepoPath2);

    console.log('Created dummy repos at:', dummyRepoPath1, dummyRepoPath2);

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

    // Clean up the dummy repositories
    for (const repoPath of [dummyRepoPath1, dummyRepoPath2]) {
      if (repoPath && fs.existsSync(repoPath)) {
        try {
          fs.rmSync(repoPath, { recursive: true, force: true });
          console.log('Cleaned up dummy repo:', repoPath);
        } catch (e) {
          console.error('Failed to clean up dummy repo:', e);
        }
      }
    }
  });

  test('should persist scheduler when switching between projects', async () => {
    test.setTimeout(90000);

    await page.waitForLoadState('domcontentloaded');

    // Mock the Electron dialog
    await electronApp.evaluate(async ({ dialog }) => {
      const mockPaths: string[] = [];
      dialog.showOpenDialog = async () => {
        const nextPath = mockPaths.shift();
        return {
          canceled: !nextPath,
          filePaths: nextPath ? [nextPath] : []
        };
      };
      (global as { mockPaths?: string[] }).mockPaths = mockPaths;
    });

    // Helper to set next dialog path
    const setNextDialogPath = async (repoPath: string) => {
      await electronApp.evaluate(async (_context, path) => {
        (global as { mockPaths?: string[] }).mockPaths?.push(path);
      }, repoPath);
    };

    // Open first project
    await expect(page.locator('h2', { hasText: 'Select a Project' })).toBeVisible({ timeout: 10000 });
    const openButton = page.locator('button', { hasText: 'Open Project Folder' });
    await expect(openButton).toBeVisible();

    await setNextDialogPath(dummyRepoPath1);
    await openButton.click();
    await page.waitForTimeout(3000);

    // Open terminal for first project
    const worktreeButton1 = page.locator('button[data-worktree-branch="main"]').first();
    await expect(worktreeButton1).toBeVisible({ timeout: 5000 });
    await worktreeButton1.click();
    await page.waitForTimeout(3000);

    // Start a repeating scheduler on first project's terminal
    const schedulerButton = page.locator('button[title="Schedule Command"]').first();
    await expect(schedulerButton).toBeVisible({ timeout: 5000 });
    await schedulerButton.click();

    await expect(page.locator('text=Schedule Terminal Command')).toBeVisible({ timeout: 5000 });

    const commandInput = page.locator('input[id="command"]');
    await commandInput.fill('echo "Project 1 Scheduler"');

    const delayInput = page.locator('input[id="delay"]');
    await delayInput.fill('2');

    const repeatCheckbox = page.locator('input[id="repeat"]');
    await repeatCheckbox.check();

    const startButton = page.locator('button', { hasText: 'Start' });
    await startButton.click();

    await expect(page.locator('text=Schedule Terminal Command')).not.toBeVisible({ timeout: 3000 });

    // Verify scheduler is running (button should be blue)
    await expect(schedulerButton).toHaveClass(/text-blue-500/, { timeout: 2000 });

    // Wait for at least one execution
    await page.waitForTimeout(2500);

    // Verify the command executed
    let terminalContent = await page.locator('.xterm-screen').first().textContent();
    expect(terminalContent).toContain('Project 1 Scheduler');

    // Open second project (this should create a new tab)
    const addProjectButton = page.locator('button[title="Add Project"]').or(page.locator('button').filter({ has: page.locator('svg.lucide-plus') })).first();
    await setNextDialogPath(dummyRepoPath2);
    await addProjectButton.click();
    await page.waitForTimeout(3000);

    // Verify we now have two project tabs
    const projectTabs = page.locator('[role="tab"]');
    await expect(projectTabs).toHaveCount(2);

    // The second project should be active now
    // Get the second project's name (basename of path)
    const project2Name = path.basename(dummyRepoPath2);

    // Verify project 2 tab is active
    const project2Tab = page.locator(`[role="tab"]:has-text("${project2Name}")`);
    await expect(project2Tab).toHaveAttribute('data-state', 'active');

    // Wait a bit to ensure project 1's scheduler continues running in the background
    await page.waitForTimeout(3000);

    // Switch back to project 1
    const project1Name = path.basename(dummyRepoPath1);
    const project1Tab = page.locator(`[role="tab"]:has-text("${project1Name}")`);
    await project1Tab.click();
    await page.waitForTimeout(2000);

    // Verify project 1 tab is now active
    await expect(project1Tab).toHaveAttribute('data-state', 'active');

    // Check if scheduler is still running (button should still be blue)
    const schedulerButtonAfterSwitch = page.locator('button[title="Schedule Command"]').first();
    await expect(schedulerButtonAfterSwitch).toHaveClass(/text-blue-500/, { timeout: 2000 });

    // Verify more executions happened while we were on project 2
    terminalContent = await page.locator('.xterm-screen').first().textContent();
    const occurrences = (terminalContent?.match(/Project 1 Scheduler/g) || []).length;

    // We expect at least 2 occurrences:
    // - 1 before switching (at 2.5s)
    // - At least 1 more during the 3s we were on project 2
    // - Possibly more after switching back
    expect(occurrences).toBeGreaterThanOrEqual(2);

    // Stop the scheduler
    await schedulerButtonAfterSwitch.click();
    await expect(page.locator('text=Schedule Terminal Command')).toBeVisible({ timeout: 5000 });

    const stopButton = page.locator('button', { hasText: 'Stop Scheduler' });
    await expect(stopButton).toBeVisible();
    await stopButton.click();

    await expect(page.locator('text=Schedule Terminal Command')).not.toBeVisible({ timeout: 3000 });

    // Verify scheduler stopped
    await page.waitForTimeout(500);
    const buttonClass = await schedulerButtonAfterSwitch.getAttribute('class');
    expect(buttonClass).not.toContain('text-blue-500');
  });
});
