import { ipcMain, BrowserWindow, app } from 'electron';
import { TerminalForkManager, getSystemDiagnostics, getExtendedDiagnostics, formatExtendedDiagnostics } from '@vibetree/core';
import { terminalSettingsManager } from './terminal-settings';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Desktop shell manager - manages fork processes for terminals
 * Each terminal gets its own isolated fork process with a single PTY
 */
class DesktopShellManager {
  private forkManager!: TerminalForkManager;
  private _initialized = false;

  constructor() {
    // Defer initialization until app is ready
  }

  /**
   * Initialize the shell manager (must be called when app is ready)
   * Registers IPC handlers and initializes the fork manager
   */
  public initialize() {
    if (this._initialized) {
      return; // Already initialized
    }
    this._initialized = true;

    const workerScriptPath = this.getWorkerScriptPath();
    this.forkManager = TerminalForkManager.initialize(workerScriptPath);
    this.setupIpcHandlers();
  }

  /**
   * Get the path to the PTY worker script
   */
  private getWorkerScriptPath(): string {
    const isDev = !app.isPackaged;

    if (isDev) {
      // Development: worker is in packages/core/dist/workers/pty-worker.cjs
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

      // Start session via fork manager - reuses existing session if terminalId matches
      const result = await this.forkManager.startSession(
        worktreePath,
        cols ?? 80,
        rows ?? 30,
        settings.setLocaleVariables,
        terminalId,
        forceNew ?? false
      );

      if (result.success && result.processId) {
        const processId = result.processId;

        // Only add listeners for new sessions
        if (result.isNew) {
          // Add output listener
          const outputListener = (data: string) => {
            if (!this.safeSend(event.sender, `shell:output:${processId}`, data)) {
              // Frame was disposed - remove this listener
              this.forkManager.removeOutputListener(processId, outputListener);
            }
          };
          this.forkManager.addOutputListener(processId, outputListener);

          // Add exit listener
          const exitListener = (exitCode: number) => {
            if (!this.safeSend(event.sender, `shell:exit:${processId}`, exitCode)) {
              // Frame was disposed - remove this listener
              this.forkManager.removeExitListener(processId, exitListener);
            }
            // Broadcast session change when terminal exits
            this.broadcastSessionChange();
          };
          this.forkManager.addExitListener(processId, exitListener);

          // Broadcast session change for new terminal
          await this.broadcastSessionChange();
        } else {
          console.log(`[DesktopShellManager] Reusing session ${processId}, skipping listener setup`);
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
      const count = await this.forkManager.terminateSessionsForWorktree(worktreePath);
      await this.broadcastSessionChange();
      return { success: true, count };
    });

    ipcMain.handle('shell:get-stats', async () => {
      const sessions = await this.forkManager.getAllSessions();
      const forkStats = this.forkManager.getStats();
      const forkDiagnostics = await this.forkManager.getDiagnostics();

      // Get session stats for diagnostics
      const sessionManagerStats = {
        totalPtyInstancesCreated: forkStats.totalForks,
        currentActiveSessions: sessions.length
      };

      // Get extended diagnostics with app-specific metrics
      const extendedDiagnostics = await getExtendedDiagnostics(sessionManagerStats);

      // Override main process PTY FDs with fork aggregates
      extendedDiagnostics.appPtyInfo.ptyMasterFds = forkDiagnostics.totalPtyMasterFds;
      extendedDiagnostics.appPtyInfo.ptySlaveFds = forkDiagnostics.totalPtySlaveFds;
      extendedDiagnostics.appPtyInfo.totalPtyFds = forkDiagnostics.totalPtyFds;

      return {
        activeProcessCount: sessions.length,
        sessions: sessions.map(s => ({
          id: s.id,
          worktreePath: s.worktreePath,
          createdAt: new Date().toISOString(),
          lastActivity: new Date().toISOString()
        })),
        spawnErrors: [],
        systemDiagnostics: extendedDiagnostics,
        forkInfo: forkStats,
        forkDiagnostics,
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
        const forkDiagnostics = await this.forkManager.getDiagnostics();

        const sessionManagerStats = {
          totalPtyInstancesCreated: forkStats.totalForks,
          currentActiveSessions: sessions.length
        };

        // Collect extended diagnostics
        const diagnostics = await getExtendedDiagnostics(sessionManagerStats);

        // Override main process PTY FDs with fork aggregates
        diagnostics.appPtyInfo.ptyMasterFds = forkDiagnostics.totalPtyMasterFds;
        diagnostics.appPtyInfo.ptySlaveFds = forkDiagnostics.totalPtySlaveFds;
        diagnostics.appPtyInfo.totalPtyFds = forkDiagnostics.totalPtyFds;

        // Add fork-specific diagnostics
        (diagnostics as any).forkInfo = forkStats;
        (diagnostics as any).forkDiagnostics = forkDiagnostics;

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
    const forkStats = this.forkManager.getStats();
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
      forkInfo: forkStats,
      systemDiagnostics
    };
  }

  // Clean up on app quit
  public async cleanup() {
    if (this._initialized) {
      await this.forkManager.terminateAll();
    }
  }
}

export const shellProcessManager = new DesktopShellManager();