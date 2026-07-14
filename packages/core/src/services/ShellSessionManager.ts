import * as crypto from 'crypto';
import { ShellStartResult, ShellWriteResult, ShellResizeResult } from '../types';
import {
  getDefaultShell,
  getPtyOptions,
  writeToPty,
  resizePty,
  killPtyForce,
  onPtyData,
  onPtyExit,
  type IPty
} from '../utils/shell';
import { OutputBuffer } from './OutputBuffer';
import { getForegroundProcessForPid, type ForegroundProcessInfo } from '../utils/process';

export interface ManagedShellSession {
  id: string;
  pty: IPty;
  worktreePath: string;
  createdAt: Date;
  lastActivity: Date;
  listeners: Map<string, (data: string) => void>;
  exitListeners: Map<string, (code: number) => void>;
  dataDisposable?: { dispose: () => void };
  outputBuffer: OutputBuffer;
}

interface SpawnError {
  timestamp: Date;
  worktreePath: string;
  error: string;
  errorCode?: string;
}

const DEFAULT_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/**
 * Unified shell session manager for all platforms.
 * Sessions outlive their listeners: a client disconnecting (window reload,
 * network blip) detaches its listeners but keeps the PTY and its output
 * buffer alive, so reconnecting clients can replay recent scrollback.
 */
export class ShellSessionManager {
  private static instance: ShellSessionManager;
  private sessions: Map<string, ManagedShellSession> = new Map();
  private idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private spawnErrors: SpawnError[] = [];
  private maxSpawnErrors = 10;
  private totalPtyInstancesCreated = 0;

  private constructor() {}

  static getInstance(): ShellSessionManager {
    if (!ShellSessionManager.instance) {
      ShellSessionManager.instance = new ShellSessionManager();
    }
    return ShellSessionManager.instance;
  }

  /**
   * Reap sessions with no activity for idleTimeoutMs. Off by default so
   * embedders decide the policy; pass 0 to disable again.
   */
  startIdleCleanup(idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS): void {
    this.stopIdleCleanup();
    if (idleTimeoutMs <= 0) return;
    this.idleTimeoutMs = idleTimeoutMs;
    this.cleanupInterval = setInterval(() => this.cleanupInactiveSessions(), 60000);
    // Do not hold the process open just for the reaper
    this.cleanupInterval.unref?.();
  }

  stopIdleCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  private trackSpawnError(worktreePath: string, errorMessage: string, error: unknown): void {
    let errorCode: string | undefined;
    if (error instanceof Error) {
      errorCode = (error as NodeJS.ErrnoException).code;
    }

    this.spawnErrors.push({
      timestamp: new Date(),
      worktreePath,
      error: errorMessage,
      errorCode
    });

    if (this.spawnErrors.length > this.maxSpawnErrors) {
      this.spawnErrors.shift();
    }
  }

  getSpawnErrors(): SpawnError[] {
    return [...this.spawnErrors];
  }

  getTotalPtyInstancesCreated(): number {
    return this.totalPtyInstancesCreated;
  }

  /**
   * Session IDs are deterministic per worktree + terminal so that a
   * reconnecting client resumes the same session instead of spawning
   * a duplicate shell.
   */
  private generateSessionId(
    worktreePath: string,
    terminalId?: string,
    forceNew: boolean = false
  ): string {
    if (forceNew) {
      return crypto.randomBytes(8).toString('hex');
    }
    const key = terminalId ? `${worktreePath}:${terminalId}` : worktreePath;
    return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
  }

  async startSession(
    worktreePath: string,
    cols = 80,
    rows = 30,
    spawnFunction?: (shell: string, args: string[], options: unknown) => IPty,
    forceNew: boolean = false,
    terminalId?: string,
    setLocaleVariables: boolean = true
  ): Promise<ShellStartResult> {
    const sessionId = this.generateSessionId(worktreePath, terminalId, forceNew);

    if (!forceNew) {
      const existingSession = this.sessions.get(sessionId);
      if (existingSession) {
        existingSession.lastActivity = new Date();
        return {
          success: true,
          processId: sessionId,
          isNew: false
        };
      }
    }

    try {
      if (!spawnFunction) {
        throw new Error('Spawn function must be provided for new sessions');
      }

      const shell = getDefaultShell();
      const options = getPtyOptions(worktreePath, cols, rows, setLocaleVariables);
      // Login shell so the user's PATH (nvm, homebrew, etc.) is available to AI CLIs
      const shellArgs = shell.includes('zsh') || shell.includes('bash') ? ['-l'] : [];

      const ptyProcess = spawnFunction(shell, shellArgs, options);
      this.totalPtyInstancesCreated++;

      const session: ManagedShellSession = {
        id: sessionId,
        pty: ptyProcess,
        worktreePath,
        createdAt: new Date(),
        lastActivity: new Date(),
        listeners: new Map(),
        exitListeners: new Map(),
        outputBuffer: new OutputBuffer()
      };

      // Buffer from the very first byte, even while no client is attached,
      // so output produced during a disconnect is not lost
      session.dataDisposable = onPtyData(ptyProcess, (data) => {
        session.outputBuffer.append(data);
        session.listeners.forEach((listener) => listener(data));
      });

      onPtyExit(ptyProcess, (exitCode) => {
        session.exitListeners.forEach((listener) => listener(exitCode));
        session.dataDisposable?.dispose();
        this.sessions.delete(sessionId);
      });

      this.sessions.set(sessionId, session);

      console.log(`Started PTY session ${sessionId} in ${worktreePath}`);

      return {
        success: true,
        processId: sessionId,
        isNew: true
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start shell';
      console.error(`Failed to start PTY session: ${errorMessage}`);
      this.trackSpawnError(worktreePath, errorMessage, error);

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  async writeToSession(sessionId: string, data: string): Promise<ShellWriteResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    try {
      writeToPty(session.pty, data);
      session.lastActivity = new Date();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to write to shell'
      };
    }
  }

  async resizeSession(sessionId: string, cols: number, rows: number): Promise<ShellResizeResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    try {
      resizePty(session.pty, cols, rows);
      session.lastActivity = new Date();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to resize shell'
      };
    }
  }

  addOutputListener(
    sessionId: string,
    listenerId: string,
    callback: (data: string) => void,
    skipReplay: boolean = false
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    this.removeOutputListener(sessionId, listenerId);
    session.listeners.set(listenerId, callback);

    if (!skipReplay && !session.outputBuffer.isEmpty) {
      const replayData = session.outputBuffer.snapshot();
      if (replayData) {
        // Deferred so the client's terminal has time to mount
        setTimeout(() => callback(replayData), 50);
      }
    }

    session.lastActivity = new Date();
    return true;
  }

  /**
   * Get the buffered output for a session, for request/response style
   * scrollback restore (avoids the replay race for clients that subscribe
   * to output events after fetching the buffer).
   */
  getBuffer(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.outputBuffer.snapshot();
  }

  removeOutputListener(sessionId: string, listenerId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    return session.listeners.delete(listenerId);
  }

  addExitListener(sessionId: string, listenerId: string, callback: (code: number) => void): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.exitListeners.set(listenerId, callback);
    return true;
  }

  removeExitListener(sessionId: string, listenerId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    return session.exitListeners.delete(listenerId);
  }

  getSession(sessionId: string): ManagedShellSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
    return session;
  }

  getAllSessions(): ManagedShellSession[] {
    return Array.from(this.sessions.values());
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  async getForegroundProcess(sessionId: string): Promise<ForegroundProcessInfo> {
    const session = this.sessions.get(sessionId);
    if (!session?.pty.pid) {
      return { pid: null, command: null };
    }
    return getForegroundProcessForPid(session.pty.pid);
  }

  /**
   * Count of sessions per worktree path, used for UI indicators.
   */
  getWorktreeSessionCounts(): Record<string, number> {
    const counts = new Map<string, number>();
    for (const session of this.sessions.values()) {
      counts.set(session.worktreePath, (counts.get(session.worktreePath) || 0) + 1);
    }
    return Object.fromEntries(counts);
  }

  async terminateSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: `Session ${sessionId} not found` };
    }

    try {
      const pid = session.pty.pid;
      console.log(`Terminating session ${sessionId} (PID: ${pid})`);

      if (session.dataDisposable) {
        session.dataDisposable.dispose();
      }

      session.listeners.clear();
      session.exitListeners.clear();

      // SIGKILL because SIGTERM does not reliably kill shell child processes;
      // killPtyForce waits for the exit event before resolving
      await killPtyForce(session.pty);

      this.sessions.delete(sessionId);
      console.log(`Successfully terminated session ${sessionId} (PID: ${pid})`);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(`Error terminating session ${sessionId}:`, errorStack || errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  async terminateSessionsForWorktree(worktreePath: string): Promise<number> {
    const sessionsToTerminate: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (session.worktreePath === worktreePath) {
        sessionsToTerminate.push(sessionId);
      }
    }

    const results = await Promise.all(
      sessionsToTerminate.map(async (sessionId) => {
        const result = await this.terminateSession(sessionId);
        return result.success ? 1 : 0;
      })
    );
    const terminated = results.reduce((sum: number, count: number) => sum + count, 0);

    console.log(`Terminated ${terminated} session(s) for worktree: ${worktreePath}`);
    return terminated;
  }

  private cleanupInactiveSessions(): void {
    const now = new Date();
    for (const [sessionId, session] of this.sessions) {
      const inactiveTime = now.getTime() - session.lastActivity.getTime();
      if (inactiveTime > this.idleTimeoutMs) {
        console.log(`Cleaning up inactive session: ${sessionId}`);
        this.terminateSession(sessionId);
      }
    }
  }

  async cleanup(): Promise<void> {
    this.stopIdleCleanup();
    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map((sessionId) => this.terminateSession(sessionId)));
  }
}
