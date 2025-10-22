import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Terminal Split PTY Process Cleanup', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath: string;

  test.beforeEach(async () => {
    // Create a dummy git repository for testing
    const timestamp = Date.now();
    dummyRepoPath = path.join(os.tmpdir(), `dummy-repo-pty-cleanup-${timestamp}`);

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
    console.log('Using test main file:', testMainPath);

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
      await electronApp.evaluate(() => process.exit(0));
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

  test('should kill PTY process when closing a terminal split', async () => {
    test.setTimeout(90000);

    await page.waitForLoadState('domcontentloaded');

    // Navigate to project
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

    const worktreeButton = page.locator('button[data-worktree-branch="main"]');
    await worktreeButton.click();
    await page.waitForTimeout(3000);

    // Get initial session count
    const initialSessionCount = await electronApp.evaluate(() => {
      const { ShellSessionManager } = require('@vibe-tree/core');
      const manager = ShellSessionManager.getInstance();
      return manager.getAllSessions().length;
    });

    console.log('Initial session count:', initialSessionCount);
    expect(initialSessionCount).toBe(1);

    // Split the terminal
    const splitButton = page.locator('button[title="Split Terminal Vertically"]').first();
    await expect(splitButton).toBeVisible();
    await splitButton.click();
    await page.waitForTimeout(2000);

    // Verify we have 2 terminals
    const splitTerminalCount = await page.locator('.claude-terminal-root').count();
    expect(splitTerminalCount).toBe(2);

    // Verify we have 2 PTY sessions
    const afterSplitSessionCount = await electronApp.evaluate(() => {
      const { ShellSessionManager } = require('@vibe-tree/core');
      const manager = ShellSessionManager.getInstance();
      return manager.getAllSessions().length;
    });

    console.log('After split session count:', afterSplitSessionCount);
    expect(afterSplitSessionCount).toBe(2);

    // Get the session IDs before closing
    const sessionIdsBefore = await electronApp.evaluate(() => {
      const { ShellSessionManager } = require('@vibe-tree/core');
      const manager = ShellSessionManager.getInstance();
      return manager.getAllSessions().map(s => s.id);
    });

    console.log('Session IDs before close:', sessionIdsBefore);

    // Close the first terminal
    const closeButton = page.locator('button[title="Close Terminal"]').first();
    await expect(closeButton).toBeVisible();
    await closeButton.click();
    await page.waitForTimeout(2000);

    // Verify we're back to 1 terminal
    const afterCloseCount = await page.locator('.claude-terminal-root').count();
    expect(afterCloseCount).toBe(1);

    // Verify we're back to 1 PTY session (the closed one should be terminated)
    const afterCloseSessionCount = await electronApp.evaluate(() => {
      const { ShellSessionManager } = require('@vibe-tree/core');
      const manager = ShellSessionManager.getInstance();
      return manager.getAllSessions().length;
    });

    console.log('After close session count:', afterCloseSessionCount);
    expect(afterCloseSessionCount).toBe(1);

    // Get the remaining session ID
    const sessionIdsAfter = await electronApp.evaluate(() => {
      const { ShellSessionManager } = require('@vibe-tree/core');
      const manager = ShellSessionManager.getInstance();
      return manager.getAllSessions().map(s => s.id);
    });

    console.log('Session IDs after close:', sessionIdsAfter);

    // Verify that one of the original sessions was removed
    const removedSessionId = sessionIdsBefore.find(id => !sessionIdsAfter.includes(id));
    expect(removedSessionId).toBeDefined();
    console.log('Removed session ID:', removedSessionId);
  });

  test('should kill PTY processes when closing multiple splits in sequence', async () => {
    test.setTimeout(90000);

    await page.waitForLoadState('domcontentloaded');

    // Navigate to project
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

    const worktreeButton = page.locator('button[data-worktree-branch="main"]');
    await worktreeButton.click();
    await page.waitForTimeout(3000);

    // Create 3 terminals by splitting twice
    for (let i = 0; i < 2; i++) {
      const splitButton = page.locator('button[title="Split Terminal Vertically"]').first();
      await splitButton.click();
      await page.waitForTimeout(2000);
    }

    // Verify we have 3 terminals
    const terminalCount = await page.locator('.claude-terminal-root').count();
    expect(terminalCount).toBe(3);

    // Verify we have 3 PTY sessions
    const sessionCount = await electronApp.evaluate(() => {
      const { ShellSessionManager } = require('@vibe-tree/core');
      const manager = ShellSessionManager.getInstance();
      return manager.getAllSessions().length;
    });
    expect(sessionCount).toBe(3);

    // Close terminals one by one and verify session count decreases
    for (let expectedCount = 2; expectedCount >= 1; expectedCount--) {
      const closeButton = page.locator('button[title="Close Terminal"]').first();
      await closeButton.click();
      await page.waitForTimeout(2000);

      const currentTerminalCount = await page.locator('.claude-terminal-root').count();
      expect(currentTerminalCount).toBe(expectedCount);

      const currentSessionCount = await electronApp.evaluate(() => {
        const { ShellSessionManager } = require('@vibe-tree/core');
        const manager = ShellSessionManager.getInstance();
        return manager.getAllSessions().length;
      });
      expect(currentSessionCount).toBe(expectedCount);
      console.log(`After closing terminal: ${expectedCount} terminals and ${currentSessionCount} sessions remaining`);
    }
  });

  test('should verify PTY process is actually killed (not just session removed)', async () => {
    test.setTimeout(90000);

    await page.waitForLoadState('domcontentloaded');

    // Navigate to project
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

    const worktreeButton = page.locator('button[data-worktree-branch="main"]');
    await worktreeButton.click();
    await page.waitForTimeout(3000);

    // Split to create a second terminal
    const splitButton = page.locator('button[title="Split Terminal Vertically"]').first();
    await splitButton.click();
    await page.waitForTimeout(2000);

    // Get the PID of the second terminal's PTY process
    const secondTerminalPid = await electronApp.evaluate(() => {
      const { ShellSessionManager } = require('@vibe-tree/core');
      const manager = ShellSessionManager.getInstance();
      const sessions = manager.getAllSessions();
      if (sessions.length < 2) return null;

      // Get the second session's PTY process ID
      const pty = sessions[1].pty;
      return pty.pid;
    });

    console.log('Second terminal PTY PID:', secondTerminalPid);
    expect(secondTerminalPid).toBeDefined();
    expect(secondTerminalPid).toBeGreaterThan(0);

    // Verify the process is running
    const isRunningBefore = await electronApp.evaluate((pid) => {
      try {
        process.kill(pid, 0); // Signal 0 checks if process exists without killing it
        return true;
      } catch (e) {
        return false;
      }
    }, secondTerminalPid);

    expect(isRunningBefore).toBe(true);
    console.log('Process is running before close');

    // Close the second terminal (the one we just created)
    const closeButtons = page.locator('button[title="Close Terminal"]');
    await closeButtons.nth(1).click();
    await page.waitForTimeout(2000);

    // Wait a bit for the process to be killed
    await page.waitForTimeout(1000);

    // Verify the process is no longer running
    const isRunningAfter = await electronApp.evaluate((pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (e) {
        return false;
      }
    }, secondTerminalPid);

    expect(isRunningAfter).toBe(false);
    console.log('Process is killed after close');
  });

  test('should handle PTY cleanup when terminal is running a long process', async () => {
    test.setTimeout(90000);

    await page.waitForLoadState('domcontentloaded');

    // Navigate to project
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

    const worktreeButton = page.locator('button[data-worktree-branch="main"]');
    await worktreeButton.click();
    await page.waitForTimeout(3000);

    // Split to create a second terminal
    const splitButton = page.locator('button[title="Split Terminal Vertically"]').first();
    await splitButton.click();
    await page.waitForTimeout(2000);

    // Start a long-running process in the second terminal (sleep for 30 seconds)
    const secondTerminalScreen = page.locator('.xterm-screen').nth(1);
    await secondTerminalScreen.click();
    await page.keyboard.type('sleep 30');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Get the PID before closing
    const ptyPid = await electronApp.evaluate(() => {
      const { ShellSessionManager } = require('@vibe-tree/core');
      const manager = ShellSessionManager.getInstance();
      const sessions = manager.getAllSessions();
      return sessions[1]?.pty.pid;
    });

    console.log('PTY PID with long-running process:', ptyPid);

    // Close the terminal while the process is running
    const closeButtons = page.locator('button[title="Close Terminal"]');
    await closeButtons.nth(1).click();
    await page.waitForTimeout(2000);

    // Verify the PTY process was killed (should not wait for sleep to finish)
    const isStillRunning = await electronApp.evaluate((pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (e) {
        return false;
      }
    }, ptyPid);

    expect(isStillRunning).toBe(false);
    console.log('Long-running process was killed immediately when terminal closed');
  });
});
