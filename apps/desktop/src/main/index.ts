import { app, BrowserWindow, nativeTheme } from 'electron';
import path from 'path';
import fs from 'fs';
import { shellProcessManager } from './shell-manager';
import './ide-detector';
import './terminal-settings';
import { registerIpcHandlers } from './ipc-handlers';
import { createMenu } from './menu';

let mainWindow: BrowserWindow | null = null;



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
  createMenu(mainWindow);
  registerIpcHandlers(mainWindow);
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


// Parsing functions are now imported from @vibetree/core