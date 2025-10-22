import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
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
      await electronApp.evaluate(() => process.exit(0));
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

  test('should return stats with correct structure when sessions exist', async () => {
    test.setTimeout(60000);

    // Manually start a shell session via IPC handler
    await electronApp.evaluate(async ({ ipcMain }, repoPath) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handlers = (ipcMain as unknown as {_invokeHandlers?: Map<string, (...args: any[]) => any>})._invokeHandlers;
      if (handlers && handlers.get('shell:start')) {
        const handler = handlers.get('shell:start');
        // Start a shell session with the test repo path
        await handler(null, repoPath, 80, 30);
      }
    }, dummyRepoPath);

    // Wait a bit for the session to be created
    await page.waitForTimeout(1000);

    // Get stats via IPC handler
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
    expect(stats.activeProcessCount).toBeGreaterThan(0);
    expect(stats.sessions.length).toBeGreaterThan(0);

    // Verify session details
    const session = stats.sessions[0];
    expect(session.worktreePath).toBe(dummyRepoPath);
    expect(session.id).toBeDefined();
    expect(session.createdAt).toBeDefined();
    expect(session.lastActivity).toBeDefined();

    // Clean up - terminate the session
    await electronApp.evaluate(async ({ ipcMain }, repoPath) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handlers = (ipcMain as unknown as {_invokeHandlers?: Map<string, (...args: any[]) => any>})._invokeHandlers;
      if (handlers && handlers.get('shell:terminate-for-worktree')) {
        const handler = handlers.get('shell:terminate-for-worktree');
        await handler(null, repoPath);
      }
    }, dummyRepoPath);
  });

  test('should show correct count with multiple sessions', async () => {
    test.setTimeout(90000);

    // Start two shell sessions via IPC handler
    await electronApp.evaluate(async ({ ipcMain }, repoPath) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handlers = (ipcMain as unknown as {_invokeHandlers?: Map<string, (...args: any[]) => any>})._invokeHandlers;
      if (handlers && handlers.get('shell:start')) {
        const handler = handlers.get('shell:start');
        // Start first session
        await handler(null, repoPath, 80, 30, false, 'terminal-1');
        // Start second session
        await handler(null, repoPath, 80, 30, false, 'terminal-2');
      }
    }, dummyRepoPath);

    // Wait for sessions to be created
    await page.waitForTimeout(1000);

    // Get stats via IPC handler
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

    // Clean up - terminate all sessions
    await electronApp.evaluate(async ({ ipcMain }, repoPath) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handlers = (ipcMain as unknown as {_invokeHandlers?: Map<string, (...args: any[]) => any>})._invokeHandlers;
      if (handlers && handlers.get('shell:terminate-for-worktree')) {
        const handler = handlers.get('shell:terminate-for-worktree');
        await handler(null, repoPath);
      }
    }, dummyRepoPath);
  });
});
