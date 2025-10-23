import { Menu, BrowserWindow, MenuItemConstructorOptions, dialog, app, ipcMain } from 'electron';
import { recentProjectsManager } from './recent-projects';
import path from 'path';

let statsDialogWindow: BrowserWindow | null = null;

// IPC handler 'shell:get-stats' is already registered in shell-manager.ts

ipcMain.on('stats-dialog:close', () => {
  console.log('[MENU] Received stats-dialog:close event');
  console.log('[MENU] statsDialogWindow exists:', !!statsDialogWindow);
  console.log('[MENU] statsDialogWindow isDestroyed:', statsDialogWindow ? statsDialogWindow.isDestroyed() : 'N/A');

  if (statsDialogWindow && !statsDialogWindow.isDestroyed()) {
    console.log('[MENU] Attempting to close statsDialogWindow');
    statsDialogWindow.close();
    console.log('[MENU] Close called successfully');
  } else {
    console.log('[MENU] Cannot close - window is null or destroyed');
  }
});

function showStatsDialog(parentWindow: BrowserWindow) {
  // Close existing stats dialog if open
  if (statsDialogWindow && !statsDialogWindow.isDestroyed()) {
    statsDialogWindow.close();
  }

  // Create new stats dialog window
  statsDialogWindow = new BrowserWindow({
    width: 600,
    height: 500,
    minWidth: 400,
    minHeight: 300,
    maxWidth: 800,
    maxHeight: 700,
    parent: parentWindow,
    modal: true,
    show: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'stats-dialog-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Load the stats dialog HTML
  statsDialogWindow.loadFile(path.join(__dirname, 'stats-dialog.html'));

  // Show window when ready - stats will be fetched via IPC
  statsDialogWindow.webContents.once('did-finish-load', () => {
    if (statsDialogWindow) {
      statsDialogWindow.show();
    }
  });

  // Clean up when dialog is closed
  statsDialogWindow.on('closed', () => {
    statsDialogWindow = null;
  });
}

export function createMenu(mainWindow: BrowserWindow | null) {
  const recentProjects = recentProjectsManager.getRecentProjects();

  const recentProjectsMenu = recentProjects.map(project => ({
    label: `${project.name} (${project.path})`,
    click: () => {
      if (mainWindow) {
        mainWindow.webContents.send('project:open-recent', project.path);
      }
    }
  }));

  const template: MenuItemConstructorOptions[] = [
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
          submenu: recentProjects.length > 0
            ? [
                ...recentProjectsMenu,
                { type: 'separator' },
                {
                  label: 'Clear Recent Projects',
                  click: () => {
                    recentProjectsManager.clearRecentProjects();
                    createMenu(mainWindow); // Recreate menu to update the list
                  }
                }
              ]
            : [{ label: 'No recent projects', enabled: false }]
        },
        { type: 'separator' },
        { role: 'quit' }
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
        },
        { type: 'separator' },
        {
          label: 'Stats...',
          click: () => {
            if (mainWindow) {
              try {
                showStatsDialog(mainWindow);
              } catch (error) {
                dialog.showErrorBox('Error', `Failed to show stats dialog: ${error}`);
              }
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

    // Window menu - after adding the app menu, Window menu is now at index 4
    const windowMenu = template[4];
    if (windowMenu && windowMenu.submenu && Array.isArray(windowMenu.submenu)) {
      windowMenu.submenu.push(
        { type: 'separator' },
        { role: 'front' }
      );
    }
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}