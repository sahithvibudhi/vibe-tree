import { ipcMain } from 'electron';
import * as pty from 'node-pty';
import { ShellSessionManager, getSystemDiagnostics, getExtendedDiagnostics, formatExtendedDiagnostics } from '@vibetree/core';
import { terminalSettingsManager } from './terminal-settings';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
      // Get current terminal settings
      const settings = terminalSettingsManager.getSettings();
      
      // Start session with node-pty spawn function and locale settings
      const result = await this.sessionManager.startSession(
        worktreePath,
        cols,
        rows,
        pty.spawn,
        forceNew,
        terminalId,
        settings.setLocaleVariables
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
      const result = await this.sessionManager.terminateSession(processId);
      return result;
    });

    ipcMain.handle('shell:terminate-for-worktree', async (_, worktreePath: string) => {
      const count = await this.sessionManager.terminateSessionsForWorktree(worktreePath);
      return { success: true, count };
    });

    ipcMain.handle('shell:get-stats', async () => {
      const sessions = this.sessionManager.getAllSessions();
      const spawnErrors = this.sessionManager.getSpawnErrors();
      const systemDiagnostics = await getSystemDiagnostics();

      return {
        activeProcessCount: sessions.length,
        sessions: sessions.map(s => ({
          id: s.id,
          worktreePath: s.worktreePath,
          createdAt: s.createdAt.toISOString(),
          lastActivity: s.lastActivity.toISOString()
        })),
        spawnErrors: spawnErrors.map(e => ({
          timestamp: e.timestamp.toISOString(),
          worktreePath: e.worktreePath,
          error: e.error,
          errorCode: e.errorCode
        })),
        systemDiagnostics
      };
    });

    ipcMain.handle('shell:diagnose', async () => {
      try {
        console.log('Running comprehensive diagnostics for posix_spawn failure analysis...');

        // Collect extended diagnostics
        const diagnostics = await getExtendedDiagnostics();

        // Format for text output
        const formattedText = formatExtendedDiagnostics(diagnostics);

        // Create diagnostics directory in user's home
        const diagDir = path.join(os.homedir(), '.vibetree', 'diagnostics');
        if (!fs.existsSync(diagDir)) {
          fs.mkdirSync(diagDir, { recursive: true });
        }

        // Create timestamped filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const textFilePath = path.join(diagDir, `posix-spawn-diagnostics-${timestamp}.txt`);
        const jsonFilePath = path.join(diagDir, `posix-spawn-diagnostics-${timestamp}.json`);

        // Write text report
        fs.writeFileSync(textFilePath, formattedText, 'utf8');
        console.log(`Text diagnostics saved to: ${textFilePath}`);

        // Write JSON for programmatic analysis
        fs.writeFileSync(jsonFilePath, JSON.stringify(diagnostics, null, 2), 'utf8');
        console.log(`JSON diagnostics saved to: ${jsonFilePath}`);

        return {
          success: true,
          textFilePath,
          jsonFilePath,
          summary: {
            timestamp: diagnostics.timestamp,
            openFds: diagnostics.openFileDescriptors,
            fdLimit: diagnostics.fileDescriptorLimit.soft,
            fdUsagePercent: diagnostics.openFileDescriptors && diagnostics.fileDescriptorLimit.soft
              ? ((diagnostics.openFileDescriptors / diagnostics.fileDescriptorLimit.soft) * 100).toFixed(1)
              : null,
            ptyProcessCount: diagnostics.ptyProcesses.count,
            childProcessCount: diagnostics.childProcesses.length,
            zombieCount: diagnostics.zombieProcessCount,
            warningCount: diagnostics.warnings.length,
            threadCount: diagnostics.threadInfo.threadCount,
            systemLoad: diagnostics.systemLoad
          }
        };
      } catch (error) {
        console.error('Failed to run diagnostics:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });
  }

  // Get process statistics
  public async getStats() {
    const sessions = this.sessionManager.getAllSessions();
    const spawnErrors = this.sessionManager.getSpawnErrors();
    const systemDiagnostics = await getSystemDiagnostics();

    return {
      activeProcessCount: sessions.length,
      sessions: sessions.map(s => ({
        id: s.id,
        worktreePath: s.worktreePath,
        createdAt: s.createdAt.toISOString(),
        lastActivity: s.lastActivity.toISOString()
      })),
      spawnErrors: spawnErrors.map(e => ({
        timestamp: e.timestamp.toISOString(),
        worktreePath: e.worktreePath,
        error: e.error,
        errorCode: e.errorCode
      })),
      systemDiagnostics
    };
  }

  // Clean up on app quit
  public async cleanup() {
    await this.sessionManager.cleanup();
  }
}

export const shellProcessManager = new DesktopShellManager();