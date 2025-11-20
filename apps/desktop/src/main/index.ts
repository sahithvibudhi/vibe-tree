import { app, BrowserWindow, nativeTheme } from 'electron';
import path from 'path';
import fs from 'fs';
import { shellProcessManager } from './shell-manager';
import { terminalSettingsManager } from './terminal-settings';
import './ide-detector';
import { registerIpcHandlers } from './ipc-handlers';
import { createMenu } from './menu';
import { quitManager } from './quit-manager';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  // Get custom app name from environment
  const autoOpenAppName = process.env.AUTO_OPEN_PROJECT_NAME;
  const windowTitle = autoOpenAppName ? `VibeTree - ${autoOpenAppName}` : 'VibeTree';

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#000000' : '#ffffff',
    icon: path.join(__dirname, '../../assets/icons/VibeTree.png'),
    title: windowTitle,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false // Prevent timer throttling when app is in background (needed for scheduler)
    }
  });

  // In development, load from Vite dev server (unless NODE_ENV=production)
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
    // DevTools can be opened manually via Toggle Developer Tools
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Set title after page loads if custom name is set
  if (autoOpenAppName) {
    mainWindow.on('page-title-updated', (event) => {
      event.preventDefault();
      mainWindow?.setTitle(windowTitle);
    });

    mainWindow.webContents.on('did-finish-load', () => {
      // Set title in both main process and renderer
      mainWindow?.setTitle(windowTitle);
      mainWindow?.webContents.executeJavaScript(`document.title = ${JSON.stringify(windowTitle)}`);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Initialize terminal settings and shell manager BEFORE creating window
  terminalSettingsManager.initialize();
  shellProcessManager.initialize();

  createWindow();
  createMenu(mainWindow);
  registerIpcHandlers(mainWindow);

  // Initialize quit manager with cleanup callback
  quitManager.initialize(mainWindow);
  quitManager.options.onQuitConfirmed = async () => {
    await shellProcessManager.cleanup();
  };

  // Auto-open project if specified via environment variable
  const autoOpenProject = process.env.AUTO_OPEN_PROJECT;
  const autoOpenAppName = process.env.AUTO_OPEN_PROJECT_NAME;
  if (autoOpenProject && mainWindow) {
    console.log('Auto-opening project:', autoOpenProject);
    if (autoOpenAppName) {
      console.log('App name:', autoOpenAppName);
    }
    // Wait for the window to be ready before sending the project:open event
    mainWindow.webContents.once('did-finish-load', () => {
      if (mainWindow && fs.existsSync(autoOpenProject)) {
        // Set title again after page load to ensure it persists
        if (autoOpenAppName) {
          mainWindow.setTitle(`VibeTree - ${autoOpenAppName}`);
        }
        setTimeout(() => {
          // Send just the path - project name will be derived from path
          mainWindow?.webContents.send('project:open', autoOpenProject);
        }, 500); // Small delay to ensure renderer is ready
      } else {
        console.error('Auto-open project path does not exist:', autoOpenProject);
      }
    });
  }
});

// Handle window-all-closed event
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


// Parsing functions are now imported from @vibetree/core