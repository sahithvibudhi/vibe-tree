import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import { closeElectronApp } from './helpers/test-launcher';
import { waitUntil } from './test-utils';
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

    // Wait for PTY process to be registered
    await waitUntil(page, {
      condition: async () => {
        const stats = await electronApp.evaluate(async ({ ipcMain }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const handlers = (ipcMain as unknown as {_invokeHandlers?: Map<string, (...args: any[]) => any>})._invokeHandlers;
          if (handlers && handlers.get('shell:get-stats')) {
            const handler = handlers.get('shell:get-stats');
            return await handler();
          }
          throw new Error('shell:get-stats handler not found');
        });

        return stats && stats.activeProcessCount === 1 && stats.sessions.length === 1;
      },
      timeoutMs: 10000,
      intervalMs: 500,
      message: 'PTY process was not registered in stats'
    });

    // Get stats for final verification
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

  test('should open stats dialog and close it', async () => {
    test.setTimeout(90000);

    await page.waitForLoadState('domcontentloaded');

    // Get all windows before opening dialog
    const windowsBefore = electronApp.windows();
    expect(windowsBefore.length).toBe(1); // Only main window

    // Open stats dialog via menu
    await electronApp.evaluate(({ Menu, BrowserWindow }) => {
      const menu = Menu.getApplicationMenu();
      if (!menu) throw new Error('No application menu');

      // Find View menu by label instead of index
      const viewMenu = menu.items.find((item: Electron.MenuItem) => item.label === 'View');
      if (!viewMenu || !viewMenu.submenu) throw new Error('View menu not found');

      // Find Stats menu item
      const statsItem = viewMenu.submenu.items.find((item: Electron.MenuItem) => item.label === 'Stats...');
      if (!statsItem || !statsItem.click) {
        // Debug: list all items
        const labels = viewMenu.submenu.items.map((item: Electron.MenuItem) => item.label);
        throw new Error(`Stats menu item not found. Available items: ${labels.join(', ')}`);
      }

      // Get the main window to pass to click
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (!mainWindow) throw new Error('Main window not found');

      // Click the Stats menu item with proper context
      if (typeof statsItem.click === 'function') {
        statsItem.click({} as Electron.KeyboardEvent, mainWindow, {} as Electron.WebContents);
      }
    });

    // Wait for dialog window to appear
    await page.waitForTimeout(1000);

    // Get all windows after opening dialog
    const windowsAfter = electronApp.windows();
    expect(windowsAfter.length).toBe(2); // Main window + stats dialog

    // Get the stats dialog window
    const statsDialog = windowsAfter.find(w => w !== windowsBefore[0]);
    expect(statsDialog).toBeDefined();

    if (!statsDialog) throw new Error('Stats dialog not found');

    // Verify dialog content
    await statsDialog.waitForLoadState('domcontentloaded');

    const title = await statsDialog.locator('h1').textContent();
    expect(title).toBe('Process Statistics');

    const activeCountText = await statsDialog.locator('#activeCount').textContent();
    expect(activeCountText).toBe('0');

    // Click OK button to close dialog
    const okButton = statsDialog.locator('button', { hasText: 'OK' });
    await expect(okButton).toBeVisible();
    await okButton.click();

    // Wait for dialog to close
    await page.waitForTimeout(500);

    // Verify dialog is closed
    const windowsFinal = electronApp.windows();
    expect(windowsFinal.length).toBe(1); // Only main window remains
  });
});
