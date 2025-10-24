import { Menu, BrowserWindow, MenuItemConstructorOptions, dialog, app, ipcMain } from 'electron';
import { recentProjectsManager } from './recent-projects';
import path from 'path';

let statsWindow: BrowserWindow | null = null;

function createStatsWindow(parentWindow: BrowserWindow) {
  // Close existing stats window if it exists
  if (statsWindow && !statsWindow.isDestroyed()) {
    statsWindow.focus();
    return;
  }

  statsWindow = new BrowserWindow({
    width: 600,
    height: 600,
    parent: parentWindow,
    modal: true,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    closable: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/stats-dialog-preload.js'),
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  statsWindow.setMenu(null);

  const htmlPath = path.join(__dirname, 'stats-dialog.html');
  statsWindow.loadFile(htmlPath);

  statsWindow.once('ready-to-show', () => {
    statsWindow?.show();
  });

  statsWindow.on('closed', () => {
    statsWindow = null;
  });
}

// Handle stats dialog close request
ipcMain.on('stats-dialog:close', () => {
  if (statsWindow && !statsWindow.isDestroyed()) {
    statsWindow.close();
  }
});

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
                createStatsWindow(mainWindow);
              } catch (error) {
                dialog.showErrorBox('Error', `Failed to open stats window: ${error}`);
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