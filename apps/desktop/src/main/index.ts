import { app, BrowserWindow, nativeTheme } from 'electron';
import path from 'path';
import fs from 'fs';
import { embeddedServer } from './embedded-server';
import { terminalSettingsManager } from './terminal-settings';
import { appSettingsManager } from './app-settings';
import { notificationSettingsManager } from './notification-settings';
import { notificationManager } from './notification-manager';
import './ide-detector';
import { registerIpcHandlers } from './ipc-handlers';
import { createMenu } from './menu';
import { quitManager } from './quit-manager';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const autoOpenAppName = process.env.AUTO_OPEN_PROJECT_NAME;
  const windowTitle = autoOpenAppName ? `VibeTree - ${autoOpenAppName}` : 'VibeTree';

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    // One unified titlebar drawn by the renderer; native window controls
    // overlay it on Windows/Linux, traffic lights inset into it on macOS
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const }
      : {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            color: nativeTheme.shouldUseDarkColors ? '#000000' : '#ffffff',
            symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#000000',
            height: 44
          }
        }),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#000000' : '#ffffff',
    icon: path.join(__dirname, '../../assets/icons/VibeTree.png'),
    title: windowTitle,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Prevent timer throttling when app is in background (needed for scheduler)
      backgroundThrottling: false
    }
  });

  const isProduction = process.env.NODE_ENV === 'production';
  if (!app.isPackaged && !isProduction) {
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
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  if (autoOpenAppName) {
    mainWindow.on('page-title-updated', (event) => {
      event.preventDefault();
      mainWindow?.setTitle(windowTitle);
    });

    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow?.setTitle(windowTitle);
      mainWindow?.webContents.executeJavaScript(`document.title = ${JSON.stringify(windowTitle)}`);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  terminalSettingsManager.initialize();
  appSettingsManager.initialize();
  notificationSettingsManager.initialize();
  // The embedded server must be listening before the renderer loads,
  // since the renderer's first act is to connect to it
  await embeddedServer.start();

  createWindow();
  createMenu(mainWindow);
  registerIpcHandlers(mainWindow);

  notificationManager.initialize(mainWindow);

  quitManager.initialize(mainWindow);
  quitManager.options.onQuitConfirmed = async () => {
    await embeddedServer.cleanup();
  };

  const autoOpenProject = process.env.AUTO_OPEN_PROJECT;
  const autoOpenAppName = process.env.AUTO_OPEN_PROJECT_NAME;
  if (autoOpenProject && mainWindow) {
    console.log('Auto-opening project:', autoOpenProject);
    if (autoOpenAppName) {
      console.log('App name:', autoOpenAppName);
    }
    mainWindow.webContents.once('did-finish-load', () => {
      if (mainWindow && fs.existsSync(autoOpenProject)) {
        if (autoOpenAppName) {
          mainWindow.setTitle(`VibeTree - ${autoOpenAppName}`);
        }
        setTimeout(() => {
          mainWindow?.webContents.send('project:open', autoOpenProject);
        }, 500);
      } else {
        console.error('Auto-open project path does not exist:', autoOpenProject);
      }
    });
  }
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
