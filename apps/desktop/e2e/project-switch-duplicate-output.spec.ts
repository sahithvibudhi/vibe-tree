import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import { closeElectronApp } from './helpers/test-launcher';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Project Switch Duplicate Output Test', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath1: string;
  let dummyRepoPath2: string;

  test.beforeEach(async () => {
    // Create two dummy git repositories for testing
    const timestamp = Date.now();
    dummyRepoPath1 = path.join(os.tmpdir(), `output-test-repo-1-${timestamp}`);
    dummyRepoPath2 = path.join(os.tmpdir(), `output-test-repo-2-${timestamp}`);

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

  test('should not duplicate output when switching between projects', async () => {
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

    // Helper to type command in terminal
    const typeInTerminal = async (text: string) => {
      // Focus the terminal
      await page.locator('.xterm-helper-textarea').first().focus();
      await page.keyboard.type(text);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500); // Wait for command to execute
    };

    // STEP 1: Open first project
    await expect(page.locator('h2', { hasText: 'Select a Project' })).toBeVisible({ timeout: 10000 });
    const openButton = page.locator('button', { hasText: 'Open Project Folder' });
    await expect(openButton).toBeVisible();

    await setNextDialogPath(dummyRepoPath1);
    await openButton.click();
    await page.waitForTimeout(3000);

    // STEP 2: Open second project (open both projects FIRST before executing commands)
    const addProjectButton = page.locator('button[title="Add Project"]').or(page.locator('button').filter({ has: page.locator('svg.lucide-plus') })).first();
    await setNextDialogPath(dummyRepoPath2);
    await addProjectButton.click();
    await page.waitForTimeout(3000);

    // STEP 3: Switch to project 1 and open its terminal
    const project1Name = path.basename(dummyRepoPath1);
    const project1Tab = page.locator(`[role="tab"]:has-text("${project1Name}")`);
    await project1Tab.click();
    await page.waitForTimeout(2000);

    // Open terminal for first project (main worktree)
    const worktreeButton1 = page.locator('button[data-worktree-branch="main"]').first();
    await expect(worktreeButton1).toBeVisible({ timeout: 5000 });
    await worktreeButton1.click();
    await page.waitForTimeout(3000);

    // STEP 4: Type "echo unique1" in project 1
    await typeInTerminal('echo "unique1"');
    await page.waitForTimeout(1000);

    // Verify "unique1" appears twice (once in input, once in output)
    let terminalContent = await page.locator('.xterm-screen').first().textContent();
    let unique1Count = (terminalContent?.match(/unique1/g) || []).length;
    console.log(`After first echo in project 1, "unique1" appears ${unique1Count} times`);
    expect(unique1Count).toBe(2);

    // STEP 5: Switch to project 2
    const project2Name = path.basename(dummyRepoPath2);
    const project2Tab = page.locator(`[role="tab"]:has-text("${project2Name}")`);
    await project2Tab.click();
    await page.waitForTimeout(2000);
    await expect(project2Tab).toHaveAttribute('data-state', 'active');

    // Open terminal for second project (main worktree)
    const worktreeButton2 = page.locator('button[data-worktree-branch="main"]').first();
    await expect(worktreeButton2).toBeVisible({ timeout: 5000 });
    await worktreeButton2.click();
    await page.waitForTimeout(3000);

    // STEP 6: Type "echo unique2" in project 2
    await typeInTerminal('echo "unique2"');
    await page.waitForTimeout(1000);

    // Verify "unique2" appears twice (once in input, once in output)
    terminalContent = await page.locator('.xterm-screen').first().textContent();
    const unique2Count = (terminalContent?.match(/unique2/g) || []).length;
    console.log(`After echo in project 2, "unique2" appears ${unique2Count} times`);
    expect(unique2Count).toBe(2);

    // STEP 7: Switch back to project 1
    await project1Tab.click();
    await page.waitForTimeout(2000);

    // Verify project 1 tab is now active
    await expect(project1Tab).toHaveAttribute('data-state', 'active');

    // STEP 8: Verify "unique1" STILL appears only twice (THIS IS THE KEY TEST)
    // If listeners are duplicated, previous output would reappear
    terminalContent = await page.locator('.xterm-screen').first().textContent();
    unique1Count = (terminalContent?.match(/unique1/g) || []).length;
    console.log(`After switching back to project 1, "unique1" appears ${unique1Count} times`);

    // This should be 2 (input+output), but with the bug it would be 4 or more
    expect(unique1Count).toBe(2);

    // STEP 9: Type a new command and verify output is not duplicated
    await typeInTerminal('echo "test123"');
    await page.waitForTimeout(1000);

    terminalContent = await page.locator('.xterm-screen').first().textContent();
    const test123Count = (terminalContent?.match(/test123/g) || []).length;
    console.log(`After new command, "test123" appears ${test123Count} times`);

    // This should be 2 (input+output), but with the bug it would be 4 or more (multiplied by number of switches)
    expect(test123Count).toBe(2);

    // CRITICAL: Also verify unique1 didn't appear again
    unique1Count = (terminalContent?.match(/unique1/g) || []).length;
    console.log(`Final check: "unique1" still appears ${unique1Count} times`);
    expect(unique1Count).toBe(2);
  });
});
