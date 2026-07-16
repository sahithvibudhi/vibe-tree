import { BaseAdapter } from './CommunicationAdapter';
import type {
  Worktree,
  GitStatus,
  ShellStartResult,
  ShellWriteResult,
  ShellResizeResult,
  WorktreeAddResult,
  WorktreeRemoveResult,
  IDE
} from '../types';

type EventHandler = (data: any) => void;

/**
 * WebSocket implementation of the communication adapter. Used by the web
 * client against a remote server and by the desktop renderer against the
 * server embedded in the Electron main process, so both platforms exercise
 * the same protocol and session semantics.
 */
export class WebSocketAdapter extends BaseAdapter {
  private ws: WebSocket | null = null;
  private messageHandlers: Map<string, (data: any) => void> = new Map();
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private messageId = 0;
  private connectionPromise: Promise<void> | null = null;
  private onDisconnect?: () => void;

  constructor(
    private wsUrl: string,
    private jwt?: string,
    onDisconnect?: () => void
  ) {
    super();
    this.onDisconnect = onDisconnect;
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    if (this.connectionPromise) return this.connectionPromise;

    this.connectionPromise = new Promise((resolve, reject) => {
      const url = this.jwt ? `${this.wsUrl}${this.wsUrl.includes('?') ? '&' : '?'}jwt=${this.jwt}` : this.wsUrl;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        resolve();
      };

      this.ws.onerror = () => {
        reject(new Error(`WebSocket connection failed: ${this.wsUrl}`));
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.id && this.messageHandlers.has(message.id)) {
            const handler = this.messageHandlers.get(message.id)!;
            this.messageHandlers.delete(message.id);
            handler(message.payload);
          }

          if (message.type && this.eventHandlers.has(message.type)) {
            const handlers = this.eventHandlers.get(message.type)!;
            handlers.forEach((handler) => {
              handler(message.payload);
            });
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        this.connectionPromise = null;
        this.onDisconnect?.();
      };
    });

    return this.connectionPromise;
  }

  private async sendMessage<T>(type: string, payload: any): Promise<T> {
    await this.connect();

    return new Promise((resolve, reject) => {
      const id = (++this.messageId).toString();

      this.messageHandlers.set(id, (data) => {
        if (data && data.error && data.success === undefined) {
          reject(new Error(data.error));
        } else {
          resolve(data);
        }
      });

      const message = { type, payload, id };
      this.ws!.send(JSON.stringify(message));

      setTimeout(() => {
        if (this.messageHandlers.has(id)) {
          this.messageHandlers.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  private addEventListener(event: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }

    this.eventHandlers.get(event)!.add(handler);

    return () => {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.eventHandlers.delete(event);
        }
      }
    };
  }

  async startShell(
    worktreePath: string,
    cols?: number,
    rows?: number,
    forceNew?: boolean,
    terminalId?: string
  ): Promise<ShellStartResult> {
    return this.sendMessage('shell:start', { worktreePath, cols, rows, forceNew, terminalId });
  }

  async writeToShell(processId: string, data: string): Promise<ShellWriteResult> {
    return this.sendMessage('shell:write', { sessionId: processId, data });
  }

  async resizeShell(processId: string, cols: number, rows: number): Promise<ShellResizeResult> {
    return this.sendMessage('shell:resize', { sessionId: processId, cols, rows });
  }

  async getShellStatus(processId: string): Promise<{ running: boolean }> {
    return this.sendMessage('shell:status', { sessionId: processId });
  }

  async getShellBuffer(processId: string): Promise<{ success: boolean; buffer: string | null }> {
    return this.sendMessage('shell:get-buffer', { sessionId: processId });
  }

  async terminateShell(processId: string): Promise<{ success: boolean; error?: string }> {
    return this.sendMessage('shell:terminate', { sessionId: processId });
  }

  async terminateShellsForWorktree(
    worktreePath: string
  ): Promise<{ success: boolean; count: number }> {
    return this.sendMessage('shell:terminate-for-worktree', { worktreePath });
  }

  async getWorktreeSessions(): Promise<Record<string, number>> {
    return this.sendMessage('shell:get-worktree-sessions', {});
  }

  onShellOutput(processId: string, callback: (data: string) => void): () => void {
    return this.addEventListener('shell:output', (payload) => {
      if (payload.sessionId === processId) {
        callback(payload.data);
      }
    });
  }

  onShellExit(processId: string, callback: (code: number) => void): () => void {
    return this.addEventListener('shell:exit', (payload) => {
      if (payload.sessionId === processId) {
        callback(payload.code);
      }
    });
  }

  onSessionsChanged(callback: (sessions: Record<string, number>) => void): () => void {
    return this.addEventListener('shell:sessions-changed', callback);
  }

  async getAgentStates(): Promise<
    Record<string, { worktreePath: string; state: 'idle' | 'working' | 'needs-input' | 'done' }>
  > {
    return this.sendMessage('shell:get-agent-states', {});
  }

  onAgentStatesChanged(
    callback: (
      states: Record<
        string,
        { worktreePath: string; state: 'idle' | 'working' | 'needs-input' | 'done' }
      >
    ) => void
  ): () => void {
    return this.addEventListener('shell:agent-states-changed', callback);
  }

  async listWorktrees(projectPath: string): Promise<Worktree[]> {
    return this.sendMessage('git:worktree:list', { projectPath });
  }

  async getGitStatus(worktreePath: string): Promise<GitStatus[]> {
    return this.sendMessage('git:status', { worktreePath });
  }

  async getGitDiff(worktreePath: string, filePath?: string): Promise<string> {
    const result = await this.sendMessage<{ diff: string }>('git:diff', { worktreePath, filePath });
    return result.diff;
  }

  async getGitDiffStaged(worktreePath: string, filePath?: string): Promise<string> {
    const result = await this.sendMessage<{ diff: string }>('git:diff:staged', {
      worktreePath,
      filePath
    });
    return result.diff;
  }

  async addWorktree(projectPath: string, branchName: string): Promise<WorktreeAddResult> {
    return this.sendMessage('git:worktree:add', { projectPath, branchName });
  }

  async removeWorktree(
    projectPath: string,
    worktreePath: string,
    branchName: string
  ): Promise<WorktreeRemoveResult> {
    return this.sendMessage('git:worktree:remove', { projectPath, worktreePath, branchName });
  }

  async detectIDEs(): Promise<IDE[]> {
    return [];
  }

  async openInIDE(
    _ideName: string,
    _projectPath: string
  ): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Cannot open IDE from this client' };
  }

  async selectDirectory(): Promise<string | undefined> {
    throw new Error('Directory selection not available over WebSocket');
  }

  async getTheme(): Promise<'light' | 'dark'> {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  onThemeChange(callback: (theme: 'light' | 'dark') => void): () => void {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      callback(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handler);

    return () => {
      mediaQuery.removeEventListener('change', handler);
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.messageHandlers.clear();
    this.eventHandlers.clear();
    this.connectionPromise = null;
  }
}
