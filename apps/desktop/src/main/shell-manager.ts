import { ipcMain } from 'electron';
import * as pty from 'node-pty';
import { ShellSessionManager } from '@vibetree/core';

/**
 * Desktop shell manager - thin wrapper around shared ShellSessionManager
 * Handles IPC communication with renderer process
 */
class DesktopShellManager {
  private sessionManager = ShellSessionManager.getInstance();

  constructor() {
    this.setupIpcHandlers();
  }

  /**
   * Safely send IPC message to renderer, handling disposed frames
   */
  private safeSend(sender: Electron.WebContents, channel: string, ...args: unknown[]): boolean {
    try {
      // Double-check: first with isDestroyed, then catch any remaining errors
      if (!sender || sender.isDestroyed()) {
        return false;
      }
      
      // Additional check for WebFrameMain disposal
      // The frame might be disposed even if sender isn't destroyed
      sender.send(channel, ...args);
      return true;
    } catch (error) {
      // Silently handle disposal errors - this is expected behavior
      // when frames are closed/navigated during async operations
      return false;
    }
  }

  private setupIpcHandlers() {
    ipcMain.handle('shell:start', async (event, worktreePath: string, cols?: number, rows?: number, forceNew?: boolean, terminalId?: string) => {
      // Start session with node-pty spawn function
      const result = await this.sessionManager.startSession(
        worktreePath,
        cols,
        rows,
        pty.spawn,
        forceNew,
        terminalId
      );

      if (result.success && result.processId) {
        const processId = result.processId;
        const listenerId = `electron-${event.sender.id}`;
        
        // Only add listeners for new sessions or if they don't exist
        // For existing sessions, listeners should already be set up
        if (result.isNew) {
          // Add output listener
          this.sessionManager.addOutputListener(processId, listenerId, (data) => {
            if (!this.safeSend(event.sender, `shell:output:${processId}`, data)) {
              // Frame was disposed - remove this listener
              this.sessionManager.removeOutputListener(processId, listenerId);
            }
          });

          // Add exit listener
          this.sessionManager.addExitListener(processId, listenerId, (exitCode) => {
            if (!this.safeSend(event.sender, `shell:exit:${processId}`, exitCode)) {
              // Frame was disposed - remove this listener
              this.sessionManager.removeExitListener(processId, listenerId);
            }
          });
        } else {
          // For existing sessions, we need to update the listener to use the current event.sender
          // because the renderer might have changed
          this.sessionManager.removeOutputListener(processId, listenerId);
          this.sessionManager.removeExitListener(processId, listenerId);
          
          // Re-add with current sender, but skip buffer replay for existing sessions
          this.sessionManager.addOutputListener(processId, listenerId, (data) => {
            if (!this.safeSend(event.sender, `shell:output:${processId}`, data)) {
              // Frame was disposed - remove this listener
              this.sessionManager.removeOutputListener(processId, listenerId);
            }
          }, true); // Skip replay for existing sessions

          this.sessionManager.addExitListener(processId, listenerId, (exitCode) => {
            if (!this.safeSend(event.sender, `shell:exit:${processId}`, exitCode)) {
              // Frame was disposed - remove this listener
              this.sessionManager.removeExitListener(processId, listenerId);
            }
          });
        }
      }

      return result;
    });

    ipcMain.handle('shell:write', async (_, processId: string, data: string) => {
      return this.sessionManager.writeToSession(processId, data);
    });

    ipcMain.handle('shell:resize', async (_, processId: string, cols: number, rows: number) => {
      return this.sessionManager.resizeSession(processId, cols, rows);
    });

    ipcMain.handle('shell:status', async (_, processId: string) => {
      return { running: this.sessionManager.hasSession(processId) };
    });

    ipcMain.handle('shell:get-buffer', async () => {
      // Buffer management handled on renderer side
      return { success: true, buffer: null };
    });

    ipcMain.handle('shell:terminate', async (_, processId: string) => {
      const success = this.sessionManager.terminateSession(processId);
      return { success };
    });
  }

  // Clean up on app quit
  public cleanup() {
    this.sessionManager.cleanup();
  }
}

export const shellProcessManager = new DesktopShellManager();