import { ipcMain, dialog, nativeTheme, shell, BrowserWindow } from 'electron';
import {
  listWorktrees,
  getGitStatus,
  getGitDiff,
  getGitDiffStaged,
  addWorktree,
  removeWorktree
} from '@vibetree/core';
import { terminalSettingsManager } from './terminal-settings';
import { recentProjectsManager } from './recent-projects';
import { schedulerHistoryManager } from './scheduler-history';
import fs from 'fs';
import { execSync } from 'child_process';
import * as os from 'os';
import * as path from 'path';

export function registerIpcHandlers(mainWindow: BrowserWindow | null) {
  // Git worktree operations
  ipcMain.handle('git:worktree-list', async (_, projectPath: string) => {
    return listWorktrees(projectPath);
  });

  ipcMain.handle('git:status', async (_, worktreePath: string) => {
    return getGitStatus(worktreePath);
  });

  ipcMain.handle('git:diff', async (_, worktreePath: string, filePath?: string) => {
    return getGitDiff(worktreePath, filePath);
  });

  ipcMain.handle('git:diff-staged', async (_, worktreePath: string, filePath?: string) => {
    return getGitDiffStaged(worktreePath, filePath);
  });

  ipcMain.handle('git:worktree-add', async (_, projectPath: string, branchName: string) => {
    return addWorktree(projectPath, branchName);
  });

  ipcMain.handle('git:worktree-remove', async (_, projectPath: string, worktreePath: string, branchName: string) => {
    return removeWorktree(projectPath, worktreePath, branchName);
  });

  // Theme handling
  ipcMain.handle('theme:get', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  });

  nativeTheme.on('updated', () => {
    mainWindow?.webContents.send('theme:changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  });

  // Dialog handling
  ipcMain.handle('dialog:select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:show-error', async (_, title: string, message: string) => {
    // In test mode (NODE_ENV=test), skip showing the dialog
    if (process.env.NODE_ENV === 'test') {
      console.error(`[TEST MODE] Error dialog: ${title} - ${message}`);
      return;
    }

    await dialog.showMessageBox({
      type: 'error',
      title,
      message,
      buttons: ['OK']
    });
  });

  // Project opening
  ipcMain.handle('project:open-path', async (_, projectPath: string) => {
    if (!projectPath) {
      return { success: false, error: 'No path provided' };
    }
    if (mainWindow && fs.existsSync(projectPath)) {
      mainWindow.webContents.send('project:open', projectPath);
      return { success: true, path: projectPath };
    }
    return { success: false, error: `Directory does not exist: ${projectPath}` };
  });

  ipcMain.handle('project:open-cwd', async () => {
    try {
      const cwd = process.cwd();
      if (mainWindow && fs.existsSync(cwd)) {
        mainWindow.webContents.send('project:open', cwd);
        return { success: true, path: cwd };
      }
      return { success: false, error: `Directory does not exist: ${cwd}` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Recent projects
  ipcMain.handle('recent-projects:get', () => {
    return recentProjectsManager.getRecentProjects();
  });

  ipcMain.handle('recent-projects:add', (_, projectPath: string) => {
    recentProjectsManager.addRecentProject(projectPath);
  });

  ipcMain.handle('recent-projects:remove', (_, projectPath: string) => {
    recentProjectsManager.removeRecentProject(projectPath);
  });

  ipcMain.handle('recent-projects:clear', () => {
    recentProjectsManager.clearRecentProjects();
  });

  // Terminal settings handlers
  ipcMain.handle('terminal-settings:get', () => {
    return terminalSettingsManager.getSettings();
  });

  ipcMain.handle('terminal-settings:update', (_, updates) => {
    terminalSettingsManager.updateSettings(updates);
    // Notify all renderer processes about the settings update
    if (mainWindow) {
      mainWindow.webContents.send('terminal-settings:changed', terminalSettingsManager.getSettings());
    }
  });

  ipcMain.handle('terminal-settings:reset', () => {
    terminalSettingsManager.resetToDefaults();
    // Notify all renderer processes about the reset
    if (mainWindow) {
      mainWindow.webContents.send('terminal-settings:changed', terminalSettingsManager.getSettings());
    }
  });

  ipcMain.handle('terminal-settings:get-fonts', () => {
    return terminalSettingsManager.getAvailableFonts();
  });

  // Scheduler history handlers
  ipcMain.handle('scheduler-history:get', () => {
    return schedulerHistoryManager.getHistory();
  });

  ipcMain.handle('scheduler-history:add', (_, command: string, delayMs: number, repeat: boolean) => {
    schedulerHistoryManager.addHistoryEntry(command, delayMs, repeat);
  });

  ipcMain.handle('scheduler-history:clear', () => {
    schedulerHistoryManager.clearHistory();
  });

  // Open external links
  ipcMain.handle('shell:open-external', async (_, url: string) => {
    await shell.openExternal(url);
  });

  // Debug: Create empty test repo for stress testing
  ipcMain.handle('debug:create-stress-test-repo', async () => {
    try {
      const tmpDir = os.tmpdir();
      const repoName = `pty-stress-test-${Date.now()}`;
      const repoPath = path.join(tmpDir, repoName);

      console.log(`Creating stress test repo at: ${repoPath}`);

      // Create base repo only
      execSync(`mkdir -p "${repoPath}"`, { stdio: 'inherit' });
      execSync('git init', { cwd: repoPath, stdio: 'inherit' });
      execSync('git config user.email "test@test.com"', { cwd: repoPath, stdio: 'inherit' });
      execSync('git config user.name "Test User"', { cwd: repoPath, stdio: 'inherit' });
      execSync('echo "# PTY Stress Test" > README.md', { cwd: repoPath, stdio: 'inherit' });
      execSync('git add .', { cwd: repoPath, stdio: 'inherit' });
      execSync('git commit -m "Initial commit"', { cwd: repoPath, stdio: 'inherit' });

      console.log(`Stress test repo created at: ${repoPath}`);
      return { success: true, path: repoPath };
    } catch (error) {
      console.error('Failed to create stress test repo:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Debug: Add single worktree to stress test repo
  ipcMain.handle('debug:add-stress-test-worktree', async (_, repoPath: string, index: number) => {
    try {
      const tmpDir = os.tmpdir();
      const repoName = path.basename(repoPath);
      const branchName = `wt-${String(index).padStart(4, '0')}`;
      const wtPath = path.join(tmpDir, `${repoName}-${branchName}`);

      execSync(`git worktree add -b ${branchName} "${wtPath}"`, { cwd: repoPath, stdio: 'pipe' });

      return { success: true, path: wtPath, branch: branchName };
    } catch (error) {
      console.error(`Failed to create worktree ${index}:`, error instanceof Error ? error.message : String(error));
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
}