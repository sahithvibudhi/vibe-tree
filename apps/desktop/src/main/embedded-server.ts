import { ipcMain } from 'electron';
import crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as pty from 'node-pty';
import {
  ShellSessionManager,
  getExtendedDiagnostics,
  formatExtendedDiagnostics,
  type IPty
} from '@vibetree/core';
import { createVibeTreeServer, type VibeTreeServer } from '@vibetree/server-core';
import { terminalSettingsManager } from './terminal-settings';
import { notificationManager } from './notification-manager';

/**
 * The desktop app embeds the same server the web client talks to, bound to
 * loopback with a per-launch token. The renderer connects over WebSocket,
 * so shell and git behavior (session reuse, scrollback replay, worktree
 * operations) is identical across desktop and web.
 */
class EmbeddedServer {
  private server: VibeTreeServer | null = null;
  private port = 0;
  private readonly token = crypto.randomBytes(24).toString('hex');
  private sessionManager = ShellSessionManager.getInstance();

  async start(): Promise<void> {
    if (this.server) return;

    this.server = createVibeTreeServer({
      config: {
        host: '127.0.0.1',
        port: 0,
        authRequired: false,
        jwtSecret: crypto.randomBytes(32).toString('hex'),
        projectPath: process.cwd(),
        defaultProjects: [],
        // Desktop sessions live until the app quits
        sessionIdleTimeoutMs: 0,
        allowInsecureLan: false,
        nodeEnv: process.env.NODE_ENV || 'production',
        staticToken: this.token
      },
      spawn: pty.spawn as unknown as (shell: string, args: string[], options: unknown) => IPty,
      getShellSettings: () => ({
        setLocaleVariables: terminalSettingsManager.getSettings().setLocaleVariables
      }),
      hooks: {
        onSessionStarted: ({ sessionId, worktreePath }) => {
          const branchName = path.basename(worktreePath);
          notificationManager.registerSession(sessionId, worktreePath, branchName);

          // Tap output in-process for Claude state detection; skipReplay so
          // buffered scrollback is not re-analyzed on every reconnect
          this.sessionManager.addOutputListener(
            sessionId,
            'desktop:notifications',
            (data) => notificationManager.processOutput(sessionId, data),
            true
          );
          this.sessionManager.addExitListener(sessionId, 'desktop:notifications', () => {
            notificationManager.unregisterSession(sessionId);
          });
        },
        onSessionExited: (sessionId) => {
          notificationManager.unregisterSession(sessionId);
        }
      }
    });

    const { port } = await this.server.listen();
    this.port = port;
    console.log(`[EmbeddedServer] Listening on 127.0.0.1:${port}`);

    this.registerIpcHandlers();
  }

  getEndpoint(): { url: string; port: number } {
    return {
      url: `ws://127.0.0.1:${this.port}?token=${this.token}`,
      port: this.port
    };
  }

  private registerIpcHandlers() {
    ipcMain.handle('server:get-endpoint', () => this.getEndpoint());

    // Foreground process detection and diagnostics stay on IPC: they are
    // OS-level introspection tied to the local machine, not terminal traffic
    ipcMain.handle('shell:get-foreground-process', async (_, processId: string) => {
      return this.sessionManager.getForegroundProcess(processId);
    });

    ipcMain.handle('shell:get-stats', async () => {
      return this.collectStats();
    });

    ipcMain.handle('shell:diagnose', async () => {
      try {
        const diagnostics = await getExtendedDiagnostics({
          totalPtyInstancesCreated: this.sessionManager.getTotalPtyInstancesCreated(),
          currentActiveSessions: this.sessionManager.getAllSessions().length
        });

        const formattedText = formatExtendedDiagnostics(diagnostics);

        const diagDir = path.join(os.homedir(), '.vibetree', 'diagnostics');
        if (!fs.existsSync(diagDir)) {
          fs.mkdirSync(diagDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const textFilePath = path.join(diagDir, `diagnostics-${timestamp}.txt`);
        const jsonFilePath = path.join(diagDir, `diagnostics-${timestamp}.json`);

        fs.writeFileSync(textFilePath, formattedText, 'utf8');
        fs.writeFileSync(jsonFilePath, JSON.stringify(diagnostics, null, 2), 'utf8');

        return {
          success: true,
          textFilePath,
          jsonFilePath,
          summary: {
            timestamp: diagnostics.timestamp,
            openFds: diagnostics.openFileDescriptors,
            fdLimit: diagnostics.fileDescriptorLimit.soft,
            fdUsagePercent:
              diagnostics.openFileDescriptors && diagnostics.fileDescriptorLimit.soft
                ? (
                    (diagnostics.openFileDescriptors / diagnostics.fileDescriptorLimit.soft) *
                    100
                  ).toFixed(1)
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

  private async collectStats() {
    const sessions = this.sessionManager.getAllSessions();
    const extendedDiagnostics = await getExtendedDiagnostics({
      totalPtyInstancesCreated: this.sessionManager.getTotalPtyInstancesCreated(),
      currentActiveSessions: sessions.length
    });

    return {
      activeProcessCount: sessions.length,
      sessions: sessions.map((s) => ({
        id: s.id,
        worktreePath: s.worktreePath,
        createdAt: s.createdAt.toISOString(),
        lastActivity: s.lastActivity.toISOString()
      })),
      spawnErrors: this.sessionManager.getSpawnErrors(),
      systemDiagnostics: extendedDiagnostics,
      extendedDiagnostics
    };
  }

  async cleanup(): Promise<void> {
    if (this.server) {
      await this.server.close();
      this.server = null;
    }
  }
}

export const embeddedServer = new EmbeddedServer();
