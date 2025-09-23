import { app, dialog, BrowserWindow } from 'electron';

export interface QuitManagerOptions {
  enableDialog?: boolean;
  onQuitConfirmed?: () => void;
  onQuitCancelled?: () => void;
}

export class QuitManager {
  private isQuitting = false;
  public options: QuitManagerOptions;

  constructor(options: QuitManagerOptions = {}) {
    this.options = {
      enableDialog: true,
      ...options
    };
  }

  /**
   * Initialize quit handlers for the application
   */
  initialize(mainWindow: BrowserWindow | null) {
    // Handle window close event
    if (mainWindow) {
      mainWindow.on('close', (event) => {
        if (!this.isQuitting && this.options.enableDialog) {
          event.preventDefault();
          this.showQuitConfirmation(mainWindow);
        }
      });
    }

    // Handle before-quit event
    app.on('before-quit', (event) => {
      if (!this.isQuitting && this.options.enableDialog) {
        event.preventDefault();
        this.showQuitConfirmation(mainWindow);
      }
    });

    // Handle window-all-closed event
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        if (!this.isQuitting && this.options.enableDialog) {
          this.showQuitConfirmation(mainWindow);
        } else if (!this.options.enableDialog) {
          app.quit();
        }
      }
    });
  }

  /**
   * Show quit confirmation dialog
   */
  showQuitConfirmation(mainWindow: BrowserWindow | null): boolean {
    // If dialog is disabled, quit immediately
    if (!this.options.enableDialog) {
      this.confirmQuit();
      return true;
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
      this.confirmQuit();
      return true;
    } else {
      this.cancelQuit();
      return false;
    }
  }

  /**
   * Confirm quit and exit the application
   */
  confirmQuit() {
    this.isQuitting = true;
    if (this.options.onQuitConfirmed) {
      this.options.onQuitConfirmed();
    }
    app.quit();
  }

  /**
   * Cancel quit operation
   */
  cancelQuit() {
    this.isQuitting = false;
    if (this.options.onQuitCancelled) {
      this.options.onQuitCancelled();
    }
  }

  /**
   * Force quit without confirmation
   */
  forceQuit() {
    this.isQuitting = true;
    app.exit(0);
  }

  /**
   * Get whether the app is in the process of quitting
   */
  getIsQuitting(): boolean {
    return this.isQuitting;
  }

  /**
   * Set whether dialog is enabled (useful for testing)
   */
  setDialogEnabled(enabled: boolean) {
    this.options.enableDialog = enabled;
  }
}

// Export a default instance that can be used throughout the app
export const quitManager = new QuitManager({
  enableDialog: process.env.DISABLE_QUIT_DIALOG !== 'true'
});