import { fork, ChildProcess } from 'child_process';
import { join } from 'path';
import * as crypto from 'crypto';

/**
 * Message types for IPC communication with worker process
 */
type WorkerRequest =
  | { type: 'start'; id: string; payload: { worktreePath: string; cols: number; rows: number; forceNew?: boolean; terminalId?: string; setLocaleVariables?: boolean } }
  | { type: 'write'; id: string; payload: { sessionId: string; data: string } }
  | { type: 'terminate'; id: string; payload: { sessionId: string } }
  | { type: 'resize'; id: string; payload: { sessionId: string; cols: number; rows: number } }
  | { type: 'get-sessions'; id: string }
  | { type: 'get-diagnostics'; id: string };

type WorkerResponse = {
  type: 'response';
  id: string;
  success: boolean;
  result?: any;
  error?: string;
};

type WorkerEvent =
  | { type: 'output'; processId: string; data: string }
  | { type: 'exit'; processId: string; code: number }
  | { type: 'sessions-changed' }
  | { type: 'error'; error: string };

/**
 * Wraps a worker process for a single worktree
 */
class WorktreeFork {
  private worker: ChildProcess;
  private worktreePath: string;
  private workerScriptPath: string;
  private pendingRequests = new Map<string, { resolve: (value: any) => void; reject: (error: any) => void }>();
  private outputListeners = new Map<string, Set<(data: string) => void>>();
  private exitListeners = new Map<string, Set<(code: number) => void>>();
  private sessionsChangedListeners = new Set<() => void>();
  private isTerminating = false;
  private workerStderr: string[] = [];

  constructor(worktreePath: string, workerScriptPath: string) {
    this.worktreePath = worktreePath;
    this.workerScriptPath = workerScriptPath;

    // Fork the worker process
    this.worker = fork(workerScriptPath, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        WORKTREE_PATH: worktreePath,
      },
    });

    // Handle messages from worker
    this.worker.on('message', (message: WorkerResponse | WorkerEvent) => {
      if (message.type === 'response') {
        this.handleResponse(message);
      } else if (message.type === 'output') {
        this.handleOutput(message);
      } else if (message.type === 'exit') {
        this.handleExit(message);
      } else if (message.type === 'sessions-changed') {
        this.handleSessionsChanged();
      } else if (message.type === 'error') {
        console.error(`[WorktreeFork] Worker error for ${worktreePath}:`, message.error);
      }
    });

    // Handle worker exit
    this.worker.on('exit', (code) => {
      if (!this.isTerminating) {
        console.error(`[WorktreeFork] Worker process exited unexpectedly for ${worktreePath} with code ${code}`);
      }

      // Build detailed error message
      let errorMsg = `Worker process exited with code ${code}`;
      if (this.workerStderr.length > 0) {
        const stderrSummary = this.workerStderr.join('\n').slice(0, 500); // First 500 chars
        errorMsg += `\n\nWorker stderr:\n${stderrSummary}`;
      }
      if (code === 1 && this.workerStderr.some(line => line.includes('MODULE_NOT_FOUND'))) {
        errorMsg += `\n\nWorker script path: ${this.workerScriptPath}`;
        errorMsg += `\nThis usually means the worker script was not built. Run: pnpm build`;
      }

      // Reject all pending requests with detailed error
      const error = new Error(errorMsg);
      for (const [id, { reject }] of this.pendingRequests) {
        reject(error);
      }
      this.pendingRequests.clear();
    });

    // Capture worker stderr for debugging
    this.worker.stderr?.on('data', (data) => {
      const stderr = data.toString();
      this.workerStderr.push(stderr);
      // Keep only last 10 lines
      if (this.workerStderr.length > 10) {
        this.workerStderr.shift();
      }
      console.error(`[WorktreeFork stderr] ${worktreePath}:`, stderr);
    });

    // Also capture stdout for debugging
    this.worker.stdout?.on('data', (data) => {
      console.log(`[WorktreeFork stdout] ${worktreePath}:`, data.toString());
    });
  }

  private handleResponse(message: WorkerResponse) {
    const pending = this.pendingRequests.get(message.id);
    if (pending) {
      this.pendingRequests.delete(message.id);
      if (message.success) {
        pending.resolve(message.result);
      } else {
        pending.reject(new Error(message.error || 'Unknown error'));
      }
    }
  }

  private handleOutput(message: { type: 'output'; processId: string; data: string }) {
    const listeners = this.outputListeners.get(message.processId);
    if (listeners) {
      for (const listener of listeners) {
        listener(message.data);
      }
    }
  }

  private handleExit(message: { type: 'exit'; processId: string; code: number }) {
    const listeners = this.exitListeners.get(message.processId);
    if (listeners) {
      for (const listener of listeners) {
        listener(message.code);
      }
    }
    // Clean up listeners for this process
    this.outputListeners.delete(message.processId);
    this.exitListeners.delete(message.processId);
  }

  /**
   * Notify parent that a process has exited (for cleanup)
   */
  onProcessExit(processId: string, callback: () => void): void {
    this.addExitListener(processId, callback);
  }

  private handleSessionsChanged() {
    for (const listener of this.sessionsChangedListeners) {
      listener();
    }
  }

  private sendRequest<T>(request: Omit<WorkerRequest, 'id'>): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomBytes(16).toString('hex');
      const requestWithId = { ...request, id } as WorkerRequest;

      this.pendingRequests.set(id, { resolve, reject });

      if (!this.worker.send(requestWithId)) {
        this.pendingRequests.delete(id);
        reject(new Error('Failed to send message to worker'));
      }

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  async startSession(worktreePath: string, cols: number, rows: number, forceNew?: boolean, terminalId?: string, setLocaleVariables?: boolean): Promise<{ success: boolean; processId?: string; isNew?: boolean; error?: string }> {
    return this.sendRequest<{ success: boolean; processId?: string; isNew?: boolean; error?: string }>({
      type: 'start' as const,
      payload: { worktreePath, cols, rows, forceNew, terminalId, setLocaleVariables },
    } as Omit<WorkerRequest, 'id'>);
  }

  async writeToSession(sessionId: string, data: string): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>({
      type: 'write' as const,
      payload: { sessionId, data },
    } as Omit<WorkerRequest, 'id'>);
  }

  async terminateSession(sessionId: string): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>({
      type: 'terminate' as const,
      payload: { sessionId },
    } as Omit<WorkerRequest, 'id'>);
  }

  async resizeSession(sessionId: string, cols: number, rows: number): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>({
      type: 'resize' as const,
      payload: { sessionId, cols, rows },
    } as Omit<WorkerRequest, 'id'>);
  }

  async getSessions(): Promise<string[]> {
    return this.sendRequest<string[]>({
      type: 'get-sessions' as const,
    } as Omit<WorkerRequest, 'id'>);
  }

  async getDiagnostics(): Promise<any> {
    return this.sendRequest<any>({
      type: 'get-diagnostics' as const,
    } as Omit<WorkerRequest, 'id'>);
  }

  addOutputListener(processId: string, listener: (data: string) => void): void {
    if (!this.outputListeners.has(processId)) {
      this.outputListeners.set(processId, new Set());
    }
    this.outputListeners.get(processId)!.add(listener);
  }

  removeOutputListener(processId: string, listener: (data: string) => void): void {
    const listeners = this.outputListeners.get(processId);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.outputListeners.delete(processId);
      }
    }
  }

  addExitListener(processId: string, listener: (code: number) => void): void {
    if (!this.exitListeners.has(processId)) {
      this.exitListeners.set(processId, new Set());
    }
    this.exitListeners.get(processId)!.add(listener);
  }

  removeExitListener(processId: string, listener: (code: number) => void): void {
    const listeners = this.exitListeners.get(processId);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.exitListeners.delete(processId);
      }
    }
  }

  addSessionsChangedListener(listener: () => void): void {
    this.sessionsChangedListeners.add(listener);
  }

  removeSessionsChangedListener(listener: () => void): void {
    this.sessionsChangedListeners.delete(listener);
  }

  async terminate(): Promise<void> {
    this.isTerminating = true;

    // Kill the worker process
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn(`[WorktreeFork] Force killing worker for ${this.worktreePath}`);
        this.worker.kill('SIGKILL');
        resolve();
      }, 5000);

      this.worker.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.worker.kill('SIGTERM');
    });
  }

  getWorktreePath(): string {
    return this.worktreePath;
  }

  isAlive(): boolean {
    return !this.worker.killed && this.worker.exitCode === null;
  }
}

/**
 * Manages worker processes, one per worktree
 */
export class WorktreeForkManager {
  private static instance: WorktreeForkManager | null = null;
  private forks = new Map<string, WorktreeFork>();
  private processIdToWorktree = new Map<string, string>(); // Maps processId to worktreePath
  private workerScriptPath: string;

  private constructor(workerScriptPath: string) {
    this.workerScriptPath = workerScriptPath;
  }

  static initialize(workerScriptPath: string): WorktreeForkManager {
    if (!WorktreeForkManager.instance) {
      WorktreeForkManager.instance = new WorktreeForkManager(workerScriptPath);
    }
    return WorktreeForkManager.instance;
  }

  static getInstance(): WorktreeForkManager {
    if (!WorktreeForkManager.instance) {
      throw new Error('WorktreeForkManager not initialized. Call initialize() first.');
    }
    return WorktreeForkManager.instance;
  }

  /**
   * Get or create fork for a worktree
   */
  private getOrCreateFork(worktreePath: string): WorktreeFork {
    let fork = this.forks.get(worktreePath);
    if (!fork || !fork.isAlive()) {
      console.log(`[WorktreeForkManager] Creating fork for worktree: ${worktreePath}`);
      fork = new WorktreeFork(worktreePath, this.workerScriptPath);
      this.forks.set(worktreePath, fork);
    }
    return fork;
  }

  async startSession(worktreePath: string, cols: number, rows: number, forceNew?: boolean, terminalId?: string, setLocaleVariables?: boolean): Promise<{ success: boolean; processId?: string; isNew?: boolean; error?: string }> {
    const fork = this.getOrCreateFork(worktreePath);
    const result = await fork.startSession(worktreePath, cols, rows, forceNew, terminalId, setLocaleVariables);

    // Track processId to worktreePath mapping
    if (result.success && result.processId) {
      const processId = result.processId;
      this.processIdToWorktree.set(processId, worktreePath);

      // Clean up mapping when process exits
      fork.addExitListener(processId, () => {
        this.processIdToWorktree.delete(processId);
      });
    }

    return result;
  }

  /**
   * Write to a session by processId
   */
  async writeToSession(sessionId: string, data: string): Promise<{ success: boolean }> {
    const worktreePath = this.processIdToWorktree.get(sessionId);
    if (!worktreePath) {
      return { success: false };
    }

    const fork = this.forks.get(worktreePath);
    if (!fork) {
      return { success: false };
    }
    return fork.writeToSession(sessionId, data);
  }

  /**
   * Terminate a session by processId
   */
  async terminateSession(sessionId: string): Promise<{ success: boolean }> {
    const worktreePath = this.processIdToWorktree.get(sessionId);
    if (!worktreePath) {
      return { success: true }; // Already terminated
    }

    const fork = this.forks.get(worktreePath);
    if (!fork) {
      return { success: true }; // Already terminated
    }

    const result = await fork.terminateSession(sessionId);

    // Clean up mapping
    if (result.success) {
      this.processIdToWorktree.delete(sessionId);
    }

    return result;
  }

  /**
   * Resize a session by processId
   */
  async resizeSession(sessionId: string, cols: number, rows: number): Promise<{ success: boolean }> {
    const worktreePath = this.processIdToWorktree.get(sessionId);
    if (!worktreePath) {
      return { success: false };
    }

    const fork = this.forks.get(worktreePath);
    if (!fork) {
      return { success: false };
    }
    return fork.resizeSession(sessionId, cols, rows);
  }

  /**
   * Terminate all sessions for a worktree and kill the fork
   */
  async terminateWorktree(worktreePath: string): Promise<void> {
    const fork = this.forks.get(worktreePath);
    if (fork) {
      console.log(`[WorktreeForkManager] Terminating fork for worktree: ${worktreePath}`);
      await fork.terminate();
      this.forks.delete(worktreePath);
    }
  }

  /**
   * Get sessions for a specific worktree
   */
  async getSessions(worktreePath: string): Promise<string[]> {
    const fork = this.forks.get(worktreePath);
    if (!fork) {
      return [];
    }
    return fork.getSessions();
  }

  /**
   * Get diagnostics for a specific worktree
   */
  async getDiagnostics(worktreePath: string): Promise<any> {
    const fork = this.forks.get(worktreePath);
    if (!fork) {
      return null;
    }
    return fork.getDiagnostics();
  }

  /**
   * Get all worktrees with active forks
   */
  getActiveWorktrees(): string[] {
    return Array.from(this.forks.keys());
  }

  /**
   * Add output listener for a session (by processId)
   */
  addOutputListener(processId: string, listener: (data: string) => void): void {
    const worktreePath = this.processIdToWorktree.get(processId);
    if (!worktreePath) {
      return;
    }

    const fork = this.forks.get(worktreePath);
    if (fork) {
      fork.addOutputListener(processId, listener);
    }
  }

  removeOutputListener(processId: string, listener: (data: string) => void): void {
    const worktreePath = this.processIdToWorktree.get(processId);
    if (!worktreePath) {
      return;
    }

    const fork = this.forks.get(worktreePath);
    if (fork) {
      fork.removeOutputListener(processId, listener);
    }
  }

  addExitListener(processId: string, listener: (code: number) => void): void {
    const worktreePath = this.processIdToWorktree.get(processId);
    if (!worktreePath) {
      return;
    }

    const fork = this.forks.get(worktreePath);
    if (fork) {
      fork.addExitListener(processId, listener);
    }
  }

  removeExitListener(processId: string, listener: (code: number) => void): void {
    const worktreePath = this.processIdToWorktree.get(processId);
    if (!worktreePath) {
      return;
    }

    const fork = this.forks.get(worktreePath);
    if (fork) {
      fork.removeExitListener(processId, listener);
    }
  }

  addSessionsChangedListener(worktreePath: string, listener: () => void): void {
    const fork = this.forks.get(worktreePath);
    if (fork) {
      fork.addSessionsChangedListener(listener);
    }
  }

  removeSessionsChangedListener(worktreePath: string, listener: () => void): void {
    const fork = this.forks.get(worktreePath);
    if (fork) {
      fork.removeSessionsChangedListener(listener);
    }
  }

  /**
   * Check if a session exists
   */
  hasSession(processId: string): boolean {
    return this.processIdToWorktree.has(processId);
  }

  /**
   * Get all sessions across all worktrees
   */
  async getAllSessions(): Promise<Array<{ id: string; worktreePath: string }>> {
    const allSessions: Array<{ id: string; worktreePath: string }> = [];

    for (const [worktreePath, fork] of this.forks) {
      const sessions = await fork.getSessions();
      sessions.forEach(id => {
        allSessions.push({ id, worktreePath });
      });
    }

    return allSessions;
  }

  /**
   * Terminate all forks and cleanup
   */
  async terminateAll(): Promise<void> {
    console.log(`[WorktreeForkManager] Terminating all ${this.forks.size} forks`);
    const promises = Array.from(this.forks.values()).map(fork => fork.terminate());
    await Promise.allSettled(promises);
    this.forks.clear();
    this.processIdToWorktree.clear();
  }

  /**
   * Get statistics about active forks
   */
  getStats(): { totalForks: number; worktrees: string[] } {
    return {
      totalForks: this.forks.size,
      worktrees: this.getActiveWorktrees(),
    };
  }
}
