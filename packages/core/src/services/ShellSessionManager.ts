import * as crypto from 'crypto';
import { 
  ShellStartResult, 
  ShellWriteResult, 
  ShellResizeResult 
} from '../types';
import {
  getDefaultShell,
  getPtyOptions,
  writeToPty,
  resizePty,
  killPty,
  onPtyData,
  onPtyExit,
  type IPty
} from '../utils/shell';

interface ShellSession {
  id: string;
  pty: IPty;
  worktreePath: string;
  createdAt: Date;
  lastActivity: Date;
  listeners: Map<string, (data: string) => void>;
  exitListeners: Map<string, (code: number) => void>;
  dataDisposable?: { dispose: () => void }; // Store the PTY data listener disposable
  outputBuffer: string[]; // Buffer to store terminal output for replay
  maxBufferSize: number; // Maximum buffer size in characters
}

/**
 * Unified shell session manager for all platforms
 * Manages PTY sessions with shared state across desktop, server, and web
 */
export class ShellSessionManager {
  private static instance: ShellSessionManager;
  private sessions: Map<string, ShellSession> = new Map();
  private sessionTimeoutMs = 30 * 60 * 1000; // 30 minutes
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    // Cleanup timer disabled - keep sessions alive for Claude feedback
    // this.cleanupInterval = setInterval(() => this.cleanupInactiveSessions(), 60000);
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ShellSessionManager {
    if (!ShellSessionManager.instance) {
      ShellSessionManager.instance = new ShellSessionManager();
    }
    return ShellSessionManager.instance;
  }

  /**
   * Generate deterministic session ID from worktree path and terminal ID
   * This ensures same session is reused for same terminal in same worktree
   */
  private generateSessionId(worktreePath: string, terminalId?: string, forceNew: boolean = false): string {
    if (forceNew) {
      // Generate a unique ID for independent sessions
      return crypto.randomBytes(8).toString('hex');
    }
    // Include terminal ID in the hash to ensure each terminal has its own session
    const key = terminalId ? `${worktreePath}:${terminalId}` : worktreePath;
    return crypto.createHash('sha256')
      .update(key)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Start or get existing shell session
   */
  async startSession(
    worktreePath: string, 
    cols = 80, 
    rows = 30,
    spawnFunction?: (shell: string, args: string[], options: any) => IPty,
    forceNew: boolean = false,
    terminalId?: string,
    setLocaleVariables: boolean = true
  ): Promise<ShellStartResult> {
    const sessionId = this.generateSessionId(worktreePath, terminalId, forceNew);
    
    // Return existing session if available (unless forceNew is true)
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

    // Create new session
    try {
      if (!spawnFunction) {
        throw new Error('Spawn function must be provided for new sessions');
      }

      const shell = getDefaultShell();
      const options = getPtyOptions(worktreePath, cols, rows, setLocaleVariables);
      // Launch as login shell to ensure proper PATH initialization
      // For zsh/bash, use -l flag. For other shells, keep empty args
      const shellArgs = shell.includes('zsh') || shell.includes('bash') ? ['-l'] : [];
      const ptyProcess = spawnFunction(shell, shellArgs, options);

      const session: ShellSession = {
        id: sessionId,
        pty: ptyProcess,
        worktreePath,
        createdAt: new Date(),
        lastActivity: new Date(),
        listeners: new Map(),
        exitListeners: new Map(),
        outputBuffer: [],
        maxBufferSize: 100000 // Approximately 100KB of text
      };

      // Handle PTY exit
      onPtyExit(ptyProcess, (exitCode) => {
        // Notify all exit listeners
        session.exitListeners.forEach(listener => listener(exitCode));
        // Remove session
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
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start shell'
      };
    }
  }

  /**
   * Write data to shell session
   */
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

  /**
   * Resize shell session
   */
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

  /**
   * Add output listener for session
   */
  addOutputListener(sessionId: string, listenerId: string, callback: (data: string) => void, skipReplay: boolean = false): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Remove old listener if exists
    this.removeOutputListener(sessionId, listenerId);

    // Add new listener
    session.listeners.set(listenerId, callback);
    
    // Subscribe to PTY data if this is the first listener
    if (session.listeners.size === 1) {
      // Dispose of any existing data listener first (shouldn't happen but be safe)
      if (session.dataDisposable) {
        session.dataDisposable.dispose();
      }
      
      session.dataDisposable = onPtyData(session.pty, (data) => {
        // Store in buffer for replay
        this.addToBuffer(session, data);
        
        // Send to all listeners
        session.listeners.forEach(listener => listener(data));
      });
    }

    // Replay buffer for new listener (unless skipReplay is true)
    if (!skipReplay && session.outputBuffer.length > 0) {
      // Combine all buffer chunks and send as one to avoid flicker
      const replayData = session.outputBuffer.join('');
      if (replayData) {
        // Use setTimeout to ensure the terminal is ready
        setTimeout(() => callback(replayData), 50);
      }
    }

    session.lastActivity = new Date();
    return true;
  }

  /**
   * Add data to session buffer, maintaining size limit
   */
  private addToBuffer(session: ShellSession, data: string): void {
    session.outputBuffer.push(data);
    
    // Trim buffer if it exceeds max size
    let totalSize = session.outputBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
    while (totalSize > session.maxBufferSize && session.outputBuffer.length > 1) {
      const removed = session.outputBuffer.shift();
      if (removed) {
        totalSize -= removed.length;
      }
    }
  }

  /**
   * Remove output listener
   */
  removeOutputListener(sessionId: string, listenerId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const removed = session.listeners.delete(listenerId);
    
    // If this was the last listener, dispose of the PTY data listener
    if (removed && session.listeners.size === 0 && session.dataDisposable) {
      session.dataDisposable.dispose();
      session.dataDisposable = undefined;
    }
    
    return removed;
  }

  /**
   * Add exit listener for session
   */
  addExitListener(sessionId: string, listenerId: string, callback: (code: number) => void): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.exitListeners.set(listenerId, callback);
    return true;
  }

  /**
   * Remove exit listener
   */
  removeExitListener(sessionId: string, listenerId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    return session.exitListeners.delete(listenerId);
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): ShellSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
    return session;
  }

  /**
   * Get all sessions
   */
  getAllSessions(): ShellSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Check if session exists
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Terminate session
   */
  terminateSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      // Dispose of data listener if it exists
      if (session.dataDisposable) {
        session.dataDisposable.dispose();
      }

      // Clear listeners
      session.listeners.clear();
      session.exitListeners.clear();

      // Kill PTY
      killPty(session.pty);

      // Remove from sessions
      this.sessions.delete(sessionId);

      console.log(`Terminated session ${sessionId}`);
      return true;
    } catch (error) {
      console.error('Error terminating session:', error);
      return false;
    }
  }

  /**
   * Terminate all sessions for a worktree path
   * Returns the number of sessions terminated
   */
  terminateSessionsForWorktree(worktreePath: string): number {
    let terminated = 0;
    const sessionsToTerminate: string[] = [];

    // Find all sessions for this worktree
    for (const [sessionId, session] of this.sessions) {
      if (session.worktreePath === worktreePath) {
        sessionsToTerminate.push(sessionId);
      }
    }

    // Terminate each session
    for (const sessionId of sessionsToTerminate) {
      if (this.terminateSession(sessionId)) {
        terminated++;
      }
    }

    console.log(`Terminated ${terminated} session(s) for worktree: ${worktreePath}`);
    return terminated;
  }

  /**
   * Clean up inactive sessions
   */
  private cleanupInactiveSessions(): void {
    const now = new Date();
    for (const [sessionId, session] of this.sessions) {
      const inactiveTime = now.getTime() - session.lastActivity.getTime();
      if (inactiveTime > this.sessionTimeoutMs) {
        console.log(`Cleaning up inactive session: ${sessionId}`);
        this.terminateSession(sessionId);
      }
    }
  }

  /**
   * Cleanup all sessions (for app shutdown)
   */
  cleanup(): void {
    // Stop cleanup timer
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Terminate all sessions
    for (const sessionId of this.sessions.keys()) {
      this.terminateSession(sessionId);
    }
  }
}