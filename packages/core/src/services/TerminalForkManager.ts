/**
 * Terminal Fork Manager
 *
 * Manages one fork process per terminal for complete PTY isolation.
 * Each terminal gets its own Node.js worker process that manages a single PTY session.
 *
 * Benefits:
 * - Complete memory isolation per terminal
 * - Automatic cleanup when fork is killed
 * - No PTY leaks - killing the fork kills the PTY
 * - Simple architecture - one fork, one PTY
 */

import { fork, ChildProcess } from 'child_process';
import * as crypto from 'crypto';
import { ShellStartResult, ShellWriteResult, ShellResizeResult } from '../types';

interface TerminalFork {
  id: string;
  process: ChildProcess;
  worktreePath: string;
  terminalId?: string;
  createdAt: Date;
  outputListeners: Set<(data: string) => void>;
  exitListeners: Set<(code: number) => void>;
}

export class TerminalForkManager {
  private static instance: TerminalForkManager | null = null;
  private forks: Map<string, TerminalFork> = new Map();
  private terminalIdToSessionId: Map<string, string> = new Map();
  private workerScriptPath: string;

  private constructor(workerScriptPath: string) {
    this.workerScriptPath = workerScriptPath;
  }

  /**
   * Initialize the singleton instance with worker script path
   */
  static initialize(workerScriptPath: string): TerminalForkManager {
    if (!TerminalForkManager.instance) {
      TerminalForkManager.instance = new TerminalForkManager(workerScriptPath);
    }
    return TerminalForkManager.instance;
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TerminalForkManager {
    if (!TerminalForkManager.instance) {
      throw new Error('TerminalForkManager not initialized. Call initialize() first.');
    }
    return TerminalForkManager.instance;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Start a new terminal session in a fork process
   * If terminalId is provided and a session already exists for it, return the existing session
   */
  async startSession(
    worktreePath: string,
    cols: number = 80,
    rows: number = 30,
    setLocaleVariables: boolean = true,
    terminalId?: string,
    forceNew: boolean = false
  ): Promise<ShellStartResult> {
    // Check if we should reuse an existing session
    if (terminalId && !forceNew) {
      const existingSessionId = this.terminalIdToSessionId.get(terminalId);
      if (existingSessionId && this.forks.has(existingSessionId)) {
        console.log(`[TerminalForkManager] Reusing existing session ${existingSessionId} for terminal ${terminalId}`);
        return {
          success: true,
          processId: existingSessionId,
          isNew: false
        };
      }
    }

    const sessionId = this.generateSessionId();

    try {
      // Spawn fork process
      const forkProcess = fork(this.workerScriptPath, [], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        env: {
          ...process.env,
          FORCE_COLOR: '1'
        }
      });

      // Create fork tracking object
      const terminalFork: TerminalFork = {
        id: sessionId,
        process: forkProcess,
        worktreePath,
        terminalId,
        createdAt: new Date(),
        outputListeners: new Set(),
        exitListeners: new Set()
      };

      // Map terminalId to sessionId for reuse
      if (terminalId) {
        this.terminalIdToSessionId.set(terminalId, sessionId);
      }

      // Wait for worker to be ready
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Worker initialization timeout'));
        }, 5000);

        const messageHandler = (message: any) => {
          if (message.type === 'ready') {
            clearTimeout(timeout);
            forkProcess.off('message', messageHandler);
            resolve();
          }
        };

        forkProcess.on('message', messageHandler);
      });

      // Setup message handlers
      this.setupForkHandlers(terminalFork);

      // Store the fork
      this.forks.set(sessionId, terminalFork);

      // Start the PTY in the worker
      forkProcess.send({
        type: 'start',
        worktreePath,
        cols,
        rows,
        setLocaleVariables
      });

      console.log(`[TerminalForkManager] Started fork for session ${sessionId} (PID: ${forkProcess.pid})`);

      return {
        success: true,
        processId: sessionId,
        isNew: true
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start fork';
      console.error(`[TerminalForkManager] Failed to start fork:`, error);

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Setup message handlers for a fork process
   */
  private setupForkHandlers(fork: TerminalFork) {
    const { process: forkProcess, id: sessionId } = fork;

    // Handle messages from worker
    forkProcess.on('message', (message: any) => {
      switch (message.type) {
        case 'output':
          // Send output to all listeners
          fork.outputListeners.forEach(listener => listener(message.data));
          break;

        case 'exit':
          // PTY exited - notify listeners and cleanup
          console.log(`[TerminalForkManager] PTY exited for session ${sessionId} with code ${message.code}`);
          fork.exitListeners.forEach(listener => listener(message.code));
          this.cleanupFork(sessionId);
          break;

        case 'error':
          console.error(`[TerminalForkManager] Error from worker ${sessionId}:`, message.error);
          break;
      }
    });

    // Handle fork process exit
    forkProcess.on('exit', (code, signal) => {
      console.log(`[TerminalForkManager] Fork process ${sessionId} exited (code: ${code}, signal: ${signal})`);
      this.cleanupFork(sessionId);
    });

    // Handle fork errors
    forkProcess.on('error', (error) => {
      console.error(`[TerminalForkManager] Fork process ${sessionId} error:`, error);
      this.cleanupFork(sessionId);
    });
  }

  /**
   * Write data to a terminal session
   */
  async writeToSession(sessionId: string, data: string): Promise<ShellWriteResult> {
    const fork = this.forks.get(sessionId);
    if (!fork) {
      return { success: false, error: 'Session not found' };
    }

    try {
      fork.process.send({
        type: 'write',
        data
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to write'
      };
    }
  }

  /**
   * Resize a terminal session
   */
  async resizeSession(sessionId: string, cols: number, rows: number): Promise<ShellResizeResult> {
    const fork = this.forks.get(sessionId);
    if (!fork) {
      return { success: false, error: 'Session not found' };
    }

    try {
      fork.process.send({
        type: 'resize',
        cols,
        rows
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to resize'
      };
    }
  }

  /**
   * Add output listener for a session
   */
  addOutputListener(sessionId: string, callback: (data: string) => void): boolean {
    const fork = this.forks.get(sessionId);
    if (!fork) return false;

    fork.outputListeners.add(callback);
    return true;
  }

  /**
   * Remove output listener
   */
  removeOutputListener(sessionId: string, callback: (data: string) => void): boolean {
    const fork = this.forks.get(sessionId);
    if (!fork) return false;

    return fork.outputListeners.delete(callback);
  }

  /**
   * Add exit listener for a session
   */
  addExitListener(sessionId: string, callback: (code: number) => void): boolean {
    const fork = this.forks.get(sessionId);
    if (!fork) return false;

    fork.exitListeners.add(callback);
    return true;
  }

  /**
   * Remove exit listener
   */
  removeExitListener(sessionId: string, callback: (code: number) => void): boolean {
    const fork = this.forks.get(sessionId);
    if (!fork) return false;

    return fork.exitListeners.delete(callback);
  }

  /**
   * Check if session exists
   */
  hasSession(sessionId: string): boolean {
    return this.forks.has(sessionId);
  }

  /**
   * Get all sessions
   */
  async getAllSessions(): Promise<Array<{ id: string; worktreePath: string }>> {
    return Array.from(this.forks.values()).map(fork => ({
      id: fork.id,
      worktreePath: fork.worktreePath
    }));
  }

  /**
   * Terminate a specific session
   */
  async terminateSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
    const fork = this.forks.get(sessionId);
    if (!fork) {
      return { success: false, error: 'Session not found' };
    }

    try {
      console.log(`[TerminalForkManager] Terminating session ${sessionId} (PID: ${fork.process.pid})`);

      // Send terminate message to worker
      fork.process.send({ type: 'terminate' });

      // Force kill if not dead after 2 seconds
      setTimeout(() => {
        if (!fork.process.killed) {
          console.log(`[TerminalForkManager] Force killing session ${sessionId}`);
          fork.process.kill('SIGKILL');
        }
      }, 2000);

      this.cleanupFork(sessionId);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to terminate'
      };
    }
  }

  /**
   * Terminate all sessions for a worktree
   */
  async terminateSessionsForWorktree(worktreePath: string): Promise<number> {
    let count = 0;
    const sessionsToTerminate: string[] = [];

    // Find all sessions for this worktree
    for (const [sessionId, fork] of this.forks) {
      if (fork.worktreePath === worktreePath) {
        sessionsToTerminate.push(sessionId);
      }
    }

    // Terminate each session
    for (const sessionId of sessionsToTerminate) {
      const result = await this.terminateSession(sessionId);
      if (result.success) {
        count++;
      }
    }

    console.log(`[TerminalForkManager] Terminated ${count} session(s) for worktree: ${worktreePath}`);
    return count;
  }

  /**
   * Terminate all sessions
   */
  async terminateAll(): Promise<void> {
    const sessionIds = Array.from(this.forks.keys());
    console.log(`[TerminalForkManager] Terminating all ${sessionIds.length} sessions`);

    await Promise.all(
      sessionIds.map(sessionId => this.terminateSession(sessionId))
    );
  }

  /**
   * Clean up a fork (remove from tracking)
   */
  private cleanupFork(sessionId: string): void {
    const fork = this.forks.get(sessionId);
    if (!fork) return;

    // Clear listeners
    fork.outputListeners.clear();
    fork.exitListeners.clear();

    // Remove terminalId mapping
    if (fork.terminalId) {
      this.terminalIdToSessionId.delete(fork.terminalId);
    }

    // Remove from tracking
    this.forks.delete(sessionId);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalForks: this.forks.size,
      forks: Array.from(this.forks.values()).map(fork => ({
        id: fork.id,
        pid: fork.process.pid,
        worktreePath: fork.worktreePath,
        createdAt: fork.createdAt.toISOString(),
        listenerCount: fork.outputListeners.size
      }))
    };
  }

  /**
   * Get aggregate PTY diagnostics from all forks
   */
  async getDiagnostics(): Promise<{
    totalPtyMasterFds: number;
    totalPtySlaveFds: number;
    totalPtyFds: number;
    forksWithPty: number;
    forkDiagnostics: Array<{
      sessionId: string;
      pid: number | undefined;
      worktreePath: string;
      ptyMasterFds: number;
      ptySlaveFds: number;
      totalPtyFds: number;
      hasPty: boolean;
    }>;
  }> {
    const diagnosticsPromises = Array.from(this.forks.values()).map(async (fork) => {
      return new Promise<{
        sessionId: string;
        pid: number | undefined;
        worktreePath: string;
        ptyMasterFds: number;
        ptySlaveFds: number;
        totalPtyFds: number;
        hasPty: boolean;
      }>((resolve) => {
        const timeout = setTimeout(() => {
          // Timeout after 2 seconds
          resolve({
            sessionId: fork.id,
            pid: fork.process.pid,
            worktreePath: fork.worktreePath,
            ptyMasterFds: 0,
            ptySlaveFds: 0,
            totalPtyFds: 0,
            hasPty: false
          });
        }, 2000);

        const messageHandler = (message: any) => {
          if (message.type === 'diagnostics') {
            clearTimeout(timeout);
            fork.process.off('message', messageHandler);
            resolve({
              sessionId: fork.id,
              pid: fork.process.pid,
              worktreePath: fork.worktreePath,
              ...message.data
            });
          }
        };

        fork.process.on('message', messageHandler);
        fork.process.send({ type: 'diagnostics' });
      });
    });

    const forkDiagnostics = await Promise.all(diagnosticsPromises);

    // Aggregate totals
    const totalPtyMasterFds = forkDiagnostics.reduce((sum, d) => sum + d.ptyMasterFds, 0);
    const totalPtySlaveFds = forkDiagnostics.reduce((sum, d) => sum + d.ptySlaveFds, 0);
    const totalPtyFds = forkDiagnostics.reduce((sum, d) => sum + d.totalPtyFds, 0);
    const forksWithPty = forkDiagnostics.filter(d => d.hasPty).length;

    return {
      totalPtyMasterFds,
      totalPtySlaveFds,
      totalPtyFds,
      forksWithPty,
      forkDiagnostics
    };
  }
}
