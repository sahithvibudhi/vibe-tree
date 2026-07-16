import { AgentActivityMonitor } from '@vibetree/core';

export type AgentState = 'idle' | 'working' | 'needs-input' | 'done';

export interface AgentStateEntry {
  worktreePath: string;
  state: AgentState;
}

type ChangeListener = (states: Record<string, AgentStateEntry>) => void;

/**
 * Fleet view of what every terminal session's agent is doing, derived
 * from PTY traffic with the same detection the notification systems use.
 * State transitions: input containing Enter means "working"; a detected
 * completion or question means "done" or "needs-input"; sessions start
 * and stay "idle" until the user submits something, so replayed
 * scrollback can never look like activity.
 */
export class AgentStateTracker {
  private sessions = new Map<
    string,
    { monitor: AgentActivityMonitor; worktreePath: string; state: AgentState }
  >();
  private listeners = new Set<ChangeListener>();

  register(sessionId: string, worktreePath: string): void {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        monitor: new AgentActivityMonitor(),
        worktreePath,
        state: 'idle'
      });
      this.emit();
    }
  }

  unregister(sessionId: string): void {
    if (this.sessions.delete(sessionId)) {
      this.emit();
    }
  }

  handleInput(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (data.includes('\r') || data.includes('\n')) {
      session.monitor.markUserInput();
      this.transition(sessionId, 'working');
    }
  }

  handleOutput(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const event = session.monitor.processOutput(data);
    if (event === 'completed') this.transition(sessionId, 'done');
    else if (event === 'question') this.transition(sessionId, 'needs-input');
  }

  getStates(): Record<string, AgentStateEntry> {
    const states: Record<string, AgentStateEntry> = {};
    this.sessions.forEach((session, sessionId) => {
      states[sessionId] = { worktreePath: session.worktreePath, state: session.state };
    });
    return states;
  }

  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private transition(sessionId: string, state: AgentState): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.state === state) return;
    session.state = state;
    this.emit();
  }

  private emit(): void {
    const states = this.getStates();
    this.listeners.forEach((listener) => listener(states));
  }
}
