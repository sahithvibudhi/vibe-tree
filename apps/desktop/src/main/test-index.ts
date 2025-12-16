import { app, BrowserWindow, nativeTheme, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { shellProcessManager } from './shell-manager';
import { terminalSettingsManager } from './terminal-settings';
import './ide-detector';
import { registerIpcHandlers } from './ipc-handlers';
import { createMenu } from './menu';

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

// For testing: allow disabling the quit dialog
const DISABLE_QUIT_DIALOG = process.env.DISABLE_QUIT_DIALOG === 'true';

function showQuitConfirmation() {
  if (DISABLE_QUIT_DIALOG) {
    isQuitting = true;
    app.quit();
    return;
  }

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
      nodeIntegration: false,
      backgroundThrottling: false // Prevent timer throttling when app is in background (needed for scheduler)
    }
  });

  // For testing, always load the built files
  const rendererPath = path.join(__dirname, '../renderer/index.html');
  console.log('Loading renderer from:', rendererPath);
  console.log('Renderer file exists:', fs.existsSync(rendererPath));
  
  mainWindow.loadFile(rendererPath);
  
  // Don't open DevTools in tests as it can interfere with content detection

  mainWindow.on('close', (event) => {
    if (!isQuitting && !DISABLE_QUIT_DIALOG) {
      event.preventDefault();
      showQuitConfirmation();
    }
  });

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
});

// Handle before-quit event to show confirmation
app.on('before-quit', async (event) => {
  if (!isQuitting && !DISABLE_QUIT_DIALOG) {
    event.preventDefault();
    showQuitConfirmation();
  } else {
    // Cleanup shell processes before quitting
    await shellProcessManager.cleanup();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (!isQuitting && !DISABLE_QUIT_DIALOG) {
      showQuitConfirmation();
    } else {
      app.quit();
    }
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

