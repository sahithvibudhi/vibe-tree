import { ipcMain, BrowserWindow, app } from 'electron';
import { WorktreeForkManager, getSystemDiagnostics, getExtendedDiagnostics, formatExtendedDiagnostics } from '@vibetree/core';
import { terminalSettingsManager } from './terminal-settings';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Desktop shell manager - thin wrapper around WorktreeForkManager
 * Handles IPC communication with renderer process
 */
class DesktopShellManager {
  private forkManager: WorktreeForkManager;
  // Track which webContents are listening to which processIds to prevent duplicate listeners
  private webContentsListeners = new Map<number, Set<string>>();

  constructor() {
    // Initialize WorktreeForkManager with path to worker script
    const workerScriptPath = this.getWorkerScriptPath();
    this.forkManager = WorktreeForkManager.initialize(workerScriptPath);

    this.setupIpcHandlers();
  }

  /**
   * Get the path to the PTY worker script
   * Handles both development and production builds
   */
  private getWorkerScriptPath(): string {
    const isDev = !app.isPackaged;

    if (isDev) {
      // Development: worker is in packages/core/dist/workers/pty-worker.cjs
      // __dirname is at: apps/desktop/dist/main
      // Need to go up to project root, then to packages/core/dist/workers
      const workerPath = path.join(__dirname, '../../../../packages/core/dist/workers/pty-worker.cjs');
      console.log('[DesktopShellManager] Worker script path:', workerPath);
      console.log('[DesktopShellManager] Worker script exists:', fs.existsSync(workerPath));
      return workerPath;
    } else {
      // Production: worker is bundled in app.asar
      return path.join(app.getAppPath(), 'node_modules/@vibetree/core/dist/workers/pty-worker.cjs');
    }
  }

  /**
   * Broadcast terminal session changes to all renderer processes
   */
  private async broadcastSessionChange() {
    const sessions = await this.forkManager.getAllSessions();
    const worktreeSessionCounts = new Map<string, number>();

    sessions.forEach(session => {
      const count = worktreeSessionCounts.get(session.worktreePath) || 0;
      worktreeSessionCounts.set(session.worktreePath, count + 1);
    });

    const sessionData = Object.fromEntries(worktreeSessionCounts);

    // Send to all windows
    BrowserWindow.getAllWindows().forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send('shell:sessions-changed', sessionData);
      }
    });
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

      // Start session via fork manager
      const result = await this.forkManager.startSession(
        worktreePath,
        cols ?? 80,
        rows ?? 30,
        forceNew,
        terminalId,
        settings.setLocaleVariables
      );

      // Log the result for debugging
      if (!result.success) {
        console.error('[DesktopShellManager] Failed to start session:', result.error);
      }

      if (result.success && result.processId) {
        const processId = result.processId;
        const webContentsId = event.sender.id;

        // Only add listeners if this webContents isn't already listening to this processId
        // This prevents duplicate listeners when reconnecting to an existing session
        if (!this.webContentsListeners.has(webContentsId)) {
          this.webContentsListeners.set(webContentsId, new Set());
        }

        const listenersForThisWebContents = this.webContentsListeners.get(webContentsId)!;

        if (!listenersForThisWebContents.has(processId)) {
          // Mark that this webContents is now listening to this processId
          listenersForThisWebContents.add(processId);

          // Add output listener
          const outputListener = (data: string) => {
            if (!this.safeSend(event.sender, `shell:output:${processId}`, data)) {
              // Frame was disposed - remove this listener and tracking
              this.forkManager.removeOutputListener(processId, outputListener);
              listenersForThisWebContents.delete(processId);
              if (listenersForThisWebContents.size === 0) {
                this.webContentsListeners.delete(webContentsId);
              }
            }
          };
          this.forkManager.addOutputListener(processId, outputListener);

          // Add exit listener
          const exitListener = (exitCode: number) => {
            if (!this.safeSend(event.sender, `shell:exit:${processId}`, exitCode)) {
              // Frame was disposed - remove this listener and tracking
              this.forkManager.removeExitListener(processId, exitListener);
            }
            // Clean up tracking when process exits
            listenersForThisWebContents.delete(processId);
            if (listenersForThisWebContents.size === 0) {
              this.webContentsListeners.delete(webContentsId);
            }
            // Broadcast session change when terminal exits
            this.broadcastSessionChange();
          };
          this.forkManager.addExitListener(processId, exitListener);
        }

        // Broadcast session change for new terminal
        if (result.isNew) {
          this.broadcastSessionChange();
        }
      }

      return result;
    });

    ipcMain.handle('shell:write', async (_, processId: string, data: string) => {
      return this.forkManager.writeToSession(processId, data);
    });

    ipcMain.handle('shell:resize', async (_, processId: string, cols: number, rows: number) => {
      return this.forkManager.resizeSession(processId, cols, rows);
    });

    ipcMain.handle('shell:status', async (_, processId: string) => {
      return { running: this.forkManager.hasSession(processId) };
    });

    ipcMain.handle('shell:get-buffer', async () => {
      // Buffer management handled on renderer side
      return { success: true, buffer: null };
    });

    ipcMain.handle('shell:terminate', async (_, processId: string) => {
      const result = await this.forkManager.terminateSession(processId);
      await this.broadcastSessionChange();
      return result;
    });

    ipcMain.handle('shell:terminate-for-worktree', async (_, worktreePath: string) => {
      await this.forkManager.terminateWorktree(worktreePath);
      await this.broadcastSessionChange();
      return { success: true, count: 0 };
    });

    ipcMain.handle('shell:get-stats', async () => {
      const sessions = await this.forkManager.getAllSessions();

      // Get extended diagnostics
      const sessionManagerStats = {
        totalPtyInstancesCreated: 0, // TODO: aggregate from all workers
        currentActiveSessions: sessions.length
      };

      const extendedDiagnostics = await getExtendedDiagnostics(sessionManagerStats);

      return {
        activeProcessCount: sessions.length,
        sessions: sessions.map(s => ({
          id: s.id,
          worktreePath: s.worktreePath,
          createdAt: new Date().toISOString(), // TODO: get from worker
          lastActivity: new Date().toISOString() // TODO: get from worker
        })),
        spawnErrors: [], // TODO: aggregate from all workers
        systemDiagnostics: extendedDiagnostics,
        // For backward compatibility
        extendedDiagnostics
      };
    });

    ipcMain.handle('shell:get-worktree-sessions', async () => {
      const sessions = await this.forkManager.getAllSessions();
      const worktreeSessionCounts = new Map<string, number>();

      sessions.forEach(session => {
        const count = worktreeSessionCounts.get(session.worktreePath) || 0;
        worktreeSessionCounts.set(session.worktreePath, count + 1);
      });

      return Object.fromEntries(worktreeSessionCounts);
    });

    ipcMain.handle('shell:diagnose', async () => {
      try {
        console.log('Running comprehensive diagnostics for posix_spawn failure analysis...');

        // Get session stats from fork manager
        const sessions = await this.forkManager.getAllSessions();
        const forkStats = this.forkManager.getStats();

        const sessionManagerStats = {
          totalPtyInstancesCreated: 0, // TODO: aggregate from all workers
          currentActiveSessions: sessions.length
        };

        // Collect extended diagnostics
        const diagnostics = await getExtendedDiagnostics(sessionManagerStats);

        // Add fork-specific diagnostics
        (diagnostics as any).forkInfo = {
          totalForks: forkStats.totalForks,
          activeWorktrees: forkStats.worktrees,
          forksPerWorktree: forkStats.worktrees.reduce((acc, wt) => {
            const count = sessions.filter(s => s.worktreePath === wt).length;
            acc[wt] = count;
            return acc;
          }, {} as Record<string, number>)
        };

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
            appPtyInfo: diagnostics.appPtyInfo,
            ptyProcessCount: diagnostics.ptyProcesses.count,
            ptyDeviceInfo: diagnostics.ptyDeviceInfo,
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
    const sessions = await this.forkManager.getAllSessions();
    const systemDiagnostics = await getSystemDiagnostics();

    return {
      activeProcessCount: sessions.length,
      sessions: sessions.map(s => ({
        id: s.id,
        worktreePath: s.worktreePath,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      })),
      spawnErrors: [],
      systemDiagnostics
    };
  }

  // Clean up on app quit
  public async cleanup() {
    await this.forkManager.terminateAll();
  }
}

export const shellProcessManager = new DesktopShellManager();