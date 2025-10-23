import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import { closeElectronApp } from './helpers/test-launcher';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Stats Menu', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath: string;

  test.beforeEach(async () => {
    // Create a dummy git repository
    const timestamp = Date.now();
    dummyRepoPath = path.join(os.tmpdir(), `dummy-repo-stats-${timestamp}`);

    // Create the directory and initialize git repo
    fs.mkdirSync(dummyRepoPath, { recursive: true });
    execSync('git init -q', { cwd: dummyRepoPath });
    execSync('git config user.email "test@example.com"', { cwd: dummyRepoPath });
    execSync('git config user.name "Test User"', { cwd: dummyRepoPath });

    // Create a dummy file and make initial commit
    fs.writeFileSync(path.join(dummyRepoPath, 'README.md'), '# Test Repository\n');
    execSync('git add .', { cwd: dummyRepoPath });
    execSync('git commit -q -m "Initial commit"', { cwd: dummyRepoPath });

    // Create main branch (some git versions don't create it by default)
    try {
      execSync('git branch -M main', { cwd: dummyRepoPath });
    } catch (e) {
      // Ignore if branch already exists
    }

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
  });

  test.afterEach(async () => {
    if (electronApp) {
      await closeElectronApp(electronApp);
    }

    // Clean up the dummy repository
    if (dummyRepoPath && fs.existsSync(dummyRepoPath)) {
      try {
        fs.rmSync(dummyRepoPath, { recursive: true, force: true });
      } catch (e) {
        console.error('Failed to clean up dummy repo:', e);
      }
    }
  });

  test('should show stats with zero processes initially', async () => {
    test.setTimeout(60000);

    // Call the IPC handler directly to get stats
    const stats = await electronApp.evaluate(async ({ ipcMain }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handlers = (ipcMain as unknown as {_invokeHandlers?: Map<string, (...args: any[]) => any>})._invokeHandlers;
      if (handlers && handlers.get('shell:get-stats')) {
        const handler = handlers.get('shell:get-stats');
        return await handler();
      }
      throw new Error('shell:get-stats handler not found');
    });

    expect(stats).toBeDefined();
    expect(stats.activeProcessCount).toBe(0);
    expect(stats.sessions).toEqual([]);
  });

  test('should show correct count after opening terminal', async () => {
    test.setTimeout(90000);

    await page.waitForLoadState('domcontentloaded');

    // Open the project
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

    // Click on the main branch worktree to open terminal
    const mainWorktreeButton = page.locator('button[data-worktree-branch="main"]');
    await expect(mainWorktreeButton).toBeVisible({ timeout: 5000 });
    await mainWorktreeButton.click();
    await page.waitForTimeout(3000);

    // Wait for terminal to be ready
    const terminalScreen = page.locator('.xterm-screen').first();
    await expect(terminalScreen).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    // Get stats - should have 1 active process
    const stats = await electronApp.evaluate(async ({ ipcMain }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handlers = (ipcMain as unknown as {_invokeHandlers?: Map<string, (...args: any[]) => any>})._invokeHandlers;
      if (handlers && handlers.get('shell:get-stats')) {
        const handler = handlers.get('shell:get-stats');
        return await handler();
      }
      throw new Error('shell:get-stats handler not found');
    });

    expect(stats).toBeDefined();
    expect(stats.activeProcessCount).toBe(1);
    expect(stats.sessions.length).toBe(1);
    // On macOS, paths may have /private prefix, so normalize for comparison
    const normalizedSessionPath = stats.sessions[0].worktreePath.replace(/^\/private/, '');
    const normalizedDummyPath = dummyRepoPath.replace(/^\/private/, '');
    expect(normalizedSessionPath).toBe(normalizedDummyPath);
  });

  test('should show correct count with multiple terminals', async () => {
    test.setTimeout(90000);

    await page.waitForLoadState('domcontentloaded');

    // Open the project
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

    // Click on the main branch worktree to open terminal
    const mainWorktreeButton = page.locator('button[data-worktree-branch="main"]');
    await expect(mainWorktreeButton).toBeVisible({ timeout: 5000 });
    await mainWorktreeButton.click();
    await page.waitForTimeout(3000);

    // Wait for terminal to be ready
    const terminalScreen = page.locator('.xterm-screen').first();
    await expect(terminalScreen).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    // Split the terminal to create a second PTY process
    const splitButton = page.locator('button[title="Split Terminal Vertically"]').first();
    await expect(splitButton).toBeVisible();
    await splitButton.click();
    await page.waitForTimeout(2000);

    // Verify we have 2 terminals
    const terminalCount = await page.locator('.claude-terminal-root').count();
    expect(terminalCount).toBe(2);

    // Get stats - should have 2 active processes
    const stats = await electronApp.evaluate(async ({ ipcMain }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handlers = (ipcMain as unknown as {_invokeHandlers?: Map<string, (...args: any[]) => any>})._invokeHandlers;
      if (handlers && handlers.get('shell:get-stats')) {
        const handler = handlers.get('shell:get-stats');
        return await handler();
      }
      throw new Error('shell:get-stats handler not found');
    });

    expect(stats).toBeDefined();
    expect(stats.activeProcessCount).toBe(2);
    expect(stats.sessions.length).toBe(2);
  });

  test('should display stats dialog with multiple worktrees and close properly', async () => {
    test.setTimeout(120000);

    await page.waitForLoadState('domcontentloaded');

    // Create 3 worktrees
    const worktreeNames = ['wt1', 'wt2', 'wt3'];
    for (const wtName of worktreeNames) {
      try {
        const wtPath = path.join(os.tmpdir(), `${path.basename(dummyRepoPath)}-${wtName}`);
        execSync(`git worktree add -b ${wtName} "${wtPath}"`, { cwd: dummyRepoPath });
      } catch (e) {
        // Worktree might already exist
      }
    }

    // Open the project
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

    // Open terminals for each worktree
    for (const wtName of worktreeNames) {
      const worktreeButton = page.locator(`button[data-worktree-branch="${wtName}"]`);
      await expect(worktreeButton).toBeVisible({ timeout: 5000 });
      await worktreeButton.click();
      await page.waitForTimeout(2000);

      // Wait for terminal to be ready
      const terminalScreen = page.locator('.xterm-screen').last();
      await expect(terminalScreen).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(1000);
    }

    // Open stats dialog via menu
    await electronApp.evaluate(async ({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      if (menu) {
        // Find View menu
        for (const item of menu.items) {
          if (item.label === 'View') {
            // Find Stats menu item
            if (item.submenu) {
              for (const subItem of item.submenu.items) {
                if (subItem.label === 'Stats...') {
                  subItem.click();
                  break;
                }
              }
            }
            break;
          }
        }
      }
    });

    await page.waitForTimeout(2000);

    // Get all windows
    const windows = electronApp.windows();
    expect(windows.length).toBeGreaterThan(1);

    // Find the stats dialog window
    let statsWindow = null;
    for (const win of windows) {
      const title = await win.title();
      if (title === 'Process Statistics') {
        statsWindow = win;
        break;
      }
    }

    expect(statsWindow).toBeTruthy();

    if (statsWindow) {
      // Verify the dialog shows 3 active processes
      const activeCount = await statsWindow.locator('#activeCount').textContent();
      expect(activeCount).toBe('3');

      // Verify 3 session items are displayed
      const sessionItems = await statsWindow.locator('.session-item').count();
      expect(sessionItems).toBe(3);

      // Verify close button exists and is visible
      const closeButton = statsWindow.locator('button', { hasText: 'OK' });
      await expect(closeButton).toBeVisible();

      // Click close button
      await closeButton.click();
      await page.waitForTimeout(1000);

      // Verify dialog is closed
      const windowsAfterClose = electronApp.windows();
      let dialogStillOpen = false;
      for (const win of windowsAfterClose) {
        const title = await win.title();
        if (title === 'Process Statistics') {
          dialogStillOpen = true;
          break;
        }
      }
      expect(dialogStillOpen).toBe(false);
    }
  });
});
