import { app, BrowserWindow, nativeTheme, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { shellProcessManager } from './shell-manager';
import './ide-detector';
import './terminal-settings';
import { registerIpcHandlers } from './ipc-handlers';
import { createMenu } from './menu';

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

function showQuitConfirmation() {
  const dialogOptions = {
    type: 'question' as const,
    buttons: ['Cancel', 'OK'],
    defaultId: 0,
    cancelId: 0,
    title: 'Quit VibeTree?',
    message: 'Quit VibeTree?',
    detail: 'All sessions will be closed.',
  };

  const choice = mainWindow
    ? dialog.showMessageBoxSync(mainWindow, dialogOptions)
    : dialog.showMessageBoxSync(dialogOptions);

  if (choice === 1) {
    isQuitting = true;
    app.quit();
  }
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

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      showQuitConfirmation();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  createMenu(mainWindow);
  registerIpcHandlers(mainWindow);
});

// Handle before-quit event to show confirmation
app.on('before-quit', (event) => {
  if (!isQuitting) {
    event.preventDefault();
    showQuitConfirmation();
  } else {
    shellProcessManager.cleanup();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (!isQuitting) {
      showQuitConfirmation();
    }
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});


// Parsing functions are now imported from @vibetree/core