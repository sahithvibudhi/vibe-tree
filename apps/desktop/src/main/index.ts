import { app, BrowserWindow, ipcMain, nativeTheme, dialog, shell, Menu } from 'electron';
import path from 'path';
import fs from 'fs';
import { shellProcessManager } from './shell-manager';
import './ide-detector';
import { recentProjectsManager } from './recent-projects';
import { terminalSettingsManager } from './terminal-settings';
import {
  listWorktrees,
  getGitStatus,
  getGitDiff,
  getGitDiffStaged,
  addWorktree,
  removeWorktree
} from '@vibetree/core';

let mainWindow: BrowserWindow | null = null;

function createMenu() {
  const recentProjects = recentProjectsManager.getRecentProjects();
  
  const recentProjectsMenu = recentProjects.map(project => ({
    label: `${project.name} (${project.path})`,
    click: () => {
      if (mainWindow) {
        mainWindow.webContents.send('project:open-recent', project.path);
      }
    }
  }));

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog({
              properties: ['openDirectory']
            });
            if (result.filePaths[0] && mainWindow) {
              mainWindow.webContents.send('project:open', result.filePaths[0]);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Recent Projects',
          submenu: recentProjectsMenu.length > 0 ? [
            ...recentProjectsMenu,
            { type: 'separator' },
            {
              label: 'Clear Recent Projects',
              click: () => {
                recentProjectsManager.clearRecentProjects();
                createMenu(); // Refresh menu
              }
            }
          ] : [
            {
              label: 'No Recent Projects',
              enabled: false
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'Terminal Settings...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:open-terminal-settings');
            }
          }
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services', submenu: [] },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });

    // Window menu
    (template[4].submenu as Electron.MenuItemConstructorOptions[]).push(
      { type: 'separator' },
      { role: 'front' }
    );
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#000000' : '#ffffff',
    icon: path.join(__dirname, '../../assets/icons/VibeTree.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // In development, load from Vite dev server
  if (!app.isPackaged) {
    let port = '3000';
    try {
      const portFile = path.join(__dirname, '../../.dev-port');
      if (fs.existsSync(portFile)) {
        port = fs.readFileSync(portFile, 'utf8').trim();
      }
    } catch (error) {
      console.warn('Could not read dev port file, using default port 3000');
    }
    mainWindow.loadURL(`http://localhost:${port}`);
    // DevTools can be opened manually via Toggle Developer Tools
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  createMenu();
});

// Clean up shell processes on quit
app.on('before-quit', () => {
  shellProcessManager.cleanup();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for git worktree operations
ipcMain.handle('git:worktree-list', async (_, projectPath: string) => {
  return listWorktrees(projectPath);
});

// Git diff and status operations
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

// Claude process manager is initialized in claude-manager.ts

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

// Programmatic project opening (for testing)
ipcMain.handle('project:open-path', async (_, projectPath: string) => {
  if (mainWindow && fs.existsSync(projectPath)) {
    mainWindow.webContents.send('project:open', projectPath);
    return { success: true };
  }
  return { success: false, error: 'Invalid path or window not ready' };
});

// Open current working directory
ipcMain.handle('project:open-cwd', async () => {
  const cwd = process.cwd();
  if (mainWindow && fs.existsSync(cwd)) {
    mainWindow.webContents.send('project:open', cwd);
    return { success: true, path: cwd };
  }
  return { success: false, error: 'Window not ready' };
});

// Open external links
ipcMain.handle('shell:open-external', async (_, url: string) => {
  await shell.openExternal(url);
});

// Recent Projects handling
ipcMain.handle('recent-projects:get', () => {
  return recentProjectsManager.getRecentProjects();
});

ipcMain.handle('recent-projects:add', (_, projectPath: string) => {
  recentProjectsManager.addRecentProject(projectPath);
  createMenu(); // Refresh menu to show updated recent projects
});

ipcMain.handle('recent-projects:remove', (_, projectPath: string) => {
  recentProjectsManager.removeRecentProject(projectPath);
  createMenu(); // Refresh menu
});

ipcMain.handle('recent-projects:clear', () => {
  recentProjectsManager.clearRecentProjects();
  createMenu(); // Refresh menu
});

// Terminal settings handlers
ipcMain.handle('terminal-settings:get', () => {
  return terminalSettingsManager.getSettings();
});

ipcMain.handle('terminal-settings:update', (_, updates) => {
  terminalSettingsManager.updateSettings(updates);
  // Notify all renderer processes about the settings update
  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send('terminal-settings:changed', terminalSettingsManager.getSettings());
  });
});

ipcMain.handle('terminal-settings:reset', () => {
  terminalSettingsManager.resetToDefaults();
  // Notify all renderer processes about the reset
  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send('terminal-settings:changed', terminalSettingsManager.getSettings());
  });
});

ipcMain.handle('terminal-settings:get-fonts', () => {
  return terminalSettingsManager.getAvailableFonts();
});

// Parsing functions are now imported from @vibetree/core