import * as pty from 'node-pty';
import { ShellSessionManager } from '@vibetree/core';

/**
 * Server shell manager - thin wrapper around shared ShellSessionManager
 * Handles WebSocket communication
 */
export class ShellManager {
  private sessionManager = ShellSessionManager.getInstance();

  async startShell(worktreePath: string, userId?: string, cols = 80, rows = 30, forceNew = false) {
    return this.sessionManager.startSession(worktreePath, cols, rows, pty.spawn, forceNew);
  }

  async writeToShell(sessionId: string, data: string) {
    return this.sessionManager.writeToSession(sessionId, data);
  }

  async resizeShell(sessionId: string, cols: number, rows: number) {
    return this.sessionManager.resizeSession(sessionId, cols, rows);
  }

  getSession(sessionId: string) {
    return this.sessionManager.getSession(sessionId);
  }

  getAllSessions() {
    return this.sessionManager.getAllSessions();
  }

  terminateSession(sessionId: string) {
    return this.sessionManager.terminateSession(sessionId);
  }

  // Add listeners for WebSocket connections
  addOutputListener(sessionId: string, connectionId: string, callback: (data: string) => void) {
    return this.sessionManager.addOutputListener(sessionId, connectionId, callback);
  }

  removeOutputListener(sessionId: string, connectionId: string) {
    return this.sessionManager.removeOutputListener(sessionId, connectionId);
  }

  addExitListener(sessionId: string, connectionId: string, callback: (code: number) => void) {
    return this.sessionManager.addExitListener(sessionId, connectionId, callback);
  }

  removeExitListener(sessionId: string, connectionId: string) {
    return this.sessionManager.removeExitListener(sessionId, connectionId);
  }
}
