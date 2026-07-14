import { ShellSessionManager, type IPty } from '@vibetree/core';

export type PtySpawn = (shell: string, args: string[], options: unknown) => IPty;

export interface ShellSettings {
  setLocaleVariables?: boolean;
}

/**
 * Thin facade over the shared ShellSessionManager. The PTY spawn function is
 * injected so this package has no native dependency of its own: the
 * standalone server and the Electron main process each provide their
 * node-pty build.
 */
export class ShellManager {
  private sessionManager = ShellSessionManager.getInstance();

  constructor(
    private spawn: PtySpawn,
    private getShellSettings?: () => ShellSettings
  ) {}

  async startShell(
    worktreePath: string,
    cols = 80,
    rows = 30,
    forceNew = false,
    terminalId?: string
  ) {
    const settings = this.getShellSettings?.() ?? {};
    return this.sessionManager.startSession(
      worktreePath,
      cols,
      rows,
      this.spawn,
      forceNew,
      terminalId,
      settings.setLocaleVariables ?? true
    );
  }

  async writeToShell(sessionId: string, data: string) {
    return this.sessionManager.writeToSession(sessionId, data);
  }

  async resizeShell(sessionId: string, cols: number, rows: number) {
    return this.sessionManager.resizeSession(sessionId, cols, rows);
  }

  hasSession(sessionId: string) {
    return this.sessionManager.hasSession(sessionId);
  }

  getSession(sessionId: string) {
    return this.sessionManager.getSession(sessionId);
  }

  getAllSessions() {
    return this.sessionManager.getAllSessions();
  }

  getBuffer(sessionId: string) {
    return this.sessionManager.getBuffer(sessionId);
  }

  getWorktreeSessionCounts() {
    return this.sessionManager.getWorktreeSessionCounts();
  }

  getForegroundProcess(sessionId: string) {
    return this.sessionManager.getForegroundProcess(sessionId);
  }

  terminateSession(sessionId: string) {
    return this.sessionManager.terminateSession(sessionId);
  }

  terminateSessionsForWorktree(worktreePath: string) {
    return this.sessionManager.terminateSessionsForWorktree(worktreePath);
  }

  addOutputListener(
    sessionId: string,
    listenerId: string,
    callback: (data: string) => void,
    skipReplay = false
  ) {
    return this.sessionManager.addOutputListener(sessionId, listenerId, callback, skipReplay);
  }

  removeOutputListener(sessionId: string, listenerId: string) {
    return this.sessionManager.removeOutputListener(sessionId, listenerId);
  }

  addExitListener(sessionId: string, listenerId: string, callback: (code: number) => void) {
    return this.sessionManager.addExitListener(sessionId, listenerId, callback);
  }

  removeExitListener(sessionId: string, listenerId: string) {
    return this.sessionManager.removeExitListener(sessionId, listenerId);
  }

  startIdleCleanup(timeoutMs: number) {
    this.sessionManager.startIdleCleanup(timeoutMs);
  }

  cleanup() {
    return this.sessionManager.cleanup();
  }
}
