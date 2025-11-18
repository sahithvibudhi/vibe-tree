/**
 * PTY Worker Process
 *
 * This worker runs in a separate Node.js process and manages all PTY sessions
 * for a single worktree. It communicates with the main process via IPC.
 */

import * as pty from 'node-pty';
import { ShellSessionManager } from '../services/ShellSessionManager';

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

class PTYWorker {
  private sessionManager: ShellSessionManager;
  private worktreePath: string;

  constructor() {
    this.worktreePath = process.env.WORKTREE_PATH || '';
    if (!this.worktreePath) {
      throw new Error('WORKTREE_PATH environment variable not set');
    }

    console.log(`[PTYWorker] Started for worktree: ${this.worktreePath}`);

    // Get singleton instance of ShellSessionManager
    this.sessionManager = ShellSessionManager.getInstance();

    // Listen for messages from parent process
    process.on('message', (message: WorkerRequest) => {
      this.handleMessage(message).catch(error => {
        console.error('[PTYWorker] Error handling message:', error);
        this.sendResponse(message.id, false, undefined, error.message);
      });
    });

    // Handle process termination
    process.on('SIGTERM', () => {
      console.log('[PTYWorker] Received SIGTERM, cleaning up...');
      this.cleanup();
    });

    process.on('SIGINT', () => {
      console.log('[PTYWorker] Received SIGINT, cleaning up...');
      this.cleanup();
    });
  }

  private async handleMessage(message: WorkerRequest): Promise<void> {
    try {
      switch (message.type) {
        case 'start':
          await this.handleStart(message);
          break;
        case 'write':
          await this.handleWrite(message);
          break;
        case 'terminate':
          await this.handleTerminate(message);
          break;
        case 'resize':
          await this.handleResize(message);
          break;
        case 'get-sessions':
          await this.handleGetSessions(message);
          break;
        case 'get-diagnostics':
          await this.handleGetDiagnostics(message);
          break;
        default:
          throw new Error(`Unknown message type: ${(message as any).type}`);
      }
    } catch (error: any) {
      this.sendResponse(message.id, false, undefined, error.message);
    }
  }

  private async handleStart(message: { type: 'start'; id: string; payload: { worktreePath: string; cols: number; rows: number; forceNew?: boolean; terminalId?: string; setLocaleVariables?: boolean } }): Promise<void> {
    const { worktreePath, cols, rows, forceNew, terminalId, setLocaleVariables } = message.payload;

    try {
      const result = await this.sessionManager.startSession(
        worktreePath,
        cols,
        rows,
        pty.spawn,
        forceNew,
        terminalId,
        setLocaleVariables
      );

      if (result.success && result.processId) {
        const processId = result.processId;
        // Add listeners for this session
        this.sessionManager.addOutputListener(processId, 'worker-output', (data: string) => {
          this.sendEvent({ type: 'output', processId, data });
        });

        this.sessionManager.addExitListener(processId, 'worker-exit', (code: number) => {
          this.sendEvent({ type: 'exit', processId, code });
        });
      }

      this.sendResponse(message.id, result.success, {
        processId: result.processId,
        isNew: result.isNew,
      }, result.error);

      // Notify about session changes
      this.sendEvent({ type: 'sessions-changed' });
    } catch (error: any) {
      this.sendResponse(message.id, false, undefined, error.message);
    }
  }

  private async handleWrite(message: { type: 'write'; id: string; payload: { sessionId: string; data: string } }): Promise<void> {
    const { sessionId, data } = message.payload;

    try {
      const result = await this.sessionManager.writeToSession(sessionId, data);
      this.sendResponse(message.id, result.success, undefined, result.error);
    } catch (error: any) {
      this.sendResponse(message.id, false, undefined, error.message);
    }
  }

  private async handleTerminate(message: { type: 'terminate'; id: string; payload: { sessionId: string } }): Promise<void> {
    const { sessionId } = message.payload;

    try {
      const result = await this.sessionManager.terminateSession(sessionId);
      this.sendResponse(message.id, result.success, undefined, result.error);

      // Notify about session changes
      this.sendEvent({ type: 'sessions-changed' });
    } catch (error: any) {
      this.sendResponse(message.id, false, undefined, error.message);
    }
  }

  private async handleResize(message: { type: 'resize'; id: string; payload: { sessionId: string; cols: number; rows: number } }): Promise<void> {
    const { sessionId, cols, rows } = message.payload;

    try {
      const result = await this.sessionManager.resizeSession(sessionId, cols, rows);
      this.sendResponse(message.id, result.success, undefined, result.error);
    } catch (error: any) {
      this.sendResponse(message.id, false, undefined, error.message);
    }
  }

  private async handleGetSessions(message: { type: 'get-sessions'; id: string }): Promise<void> {
    try {
      const sessions = this.sessionManager.getAllSessions();
      const sessionIds = sessions.map(s => s.id);
      this.sendResponse(message.id, true, sessionIds);
    } catch (error: any) {
      this.sendResponse(message.id, false, undefined, error.message);
    }
  }

  private async handleGetDiagnostics(message: { type: 'get-diagnostics'; id: string }): Promise<void> {
    try {
      const allSessions = this.sessionManager.getAllSessions();
      const diagnostics = {
        worktreePath: this.worktreePath,
        activeSessions: allSessions.length,
        totalPtyCreated: this.sessionManager.getTotalPtyInstancesCreated(),
        sessions: allSessions.map(s => s.id),
      };
      this.sendResponse(message.id, true, diagnostics);
    } catch (error: any) {
      this.sendResponse(message.id, false, undefined, error.message);
    }
  }

  private sendResponse(id: string, success: boolean, result?: any, error?: string): void {
    const response: WorkerResponse = {
      type: 'response',
      id,
      success,
      result,
      error,
    };

    if (process.send) {
      process.send(response);
    }
  }

  private sendEvent(event: WorkerEvent): void {
    if (process.send) {
      process.send(event);
    }
  }

  private async cleanup(): Promise<void> {
    try {
      console.log('[PTYWorker] Terminating all sessions...');
      const sessions = this.sessionManager.getAllSessions();
      await Promise.allSettled(
        sessions.map((session) => this.sessionManager.terminateSession(session.id))
      );
      console.log('[PTYWorker] Cleanup complete');
    } catch (error) {
      console.error('[PTYWorker] Error during cleanup:', error);
    } finally {
      process.exit(0);
    }
  }
}

// Start the worker
new PTYWorker();
