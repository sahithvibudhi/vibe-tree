import { useEffect, useState } from 'react';
import { useWebSocket } from './useWebSocket';
import { useAppStore } from '../store';

export type AgentState = 'idle' | 'working' | 'needs-input' | 'done';

export interface AgentStateEntry {
  worktreePath: string;
  state: AgentState;
}

// Ranks states so a worktree with several sessions shows its most
// attention-worthy one
const URGENCY: AgentState[] = ['needs-input', 'working', 'done', 'idle'];

export function mostUrgentState(states: AgentState[]): AgentState | null {
  for (const state of URGENCY) {
    if (states.includes(state)) return state;
  }
  return null;
}

/**
 * Live per-session agent states from the server, keyed by session ID.
 * Also exposes a per-worktree rollup for sidebar chips and counts.
 */
export function useAgentStates() {
  const { getAdapter } = useWebSocket();
  const { connected } = useAppStore();
  const [sessionStates, setSessionStates] = useState<Record<string, AgentStateEntry>>({});

  useEffect(() => {
    const adapter = getAdapter();
    if (!adapter || !connected) return;

    let cancelled = false;

    adapter
      .getAgentStates()
      .then((states) => {
        if (!cancelled) setSessionStates(states);
      })
      .catch(() => {
        // The change broadcast below still corrects the state
      });

    const unsubscribe = adapter.onAgentStatesChanged((states) => {
      if (!cancelled) setSessionStates(states);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [getAdapter, connected]);

  const byWorktree: Record<string, AgentState> = {};
  const grouped = new Map<string, AgentState[]>();
  Object.values(sessionStates).forEach(({ worktreePath, state }) => {
    grouped.set(worktreePath, [...(grouped.get(worktreePath) ?? []), state]);
  });
  grouped.forEach((states, worktreePath) => {
    const urgent = mostUrgentState(states);
    if (urgent) byWorktree[worktreePath] = urgent;
  });

  const counts = { working: 0, needsInput: 0, done: 0 };
  Object.values(byWorktree).forEach((state) => {
    if (state === 'working') counts.working += 1;
    else if (state === 'needs-input') counts.needsInput += 1;
    else if (state === 'done') counts.done += 1;
  });

  return { sessionStates, byWorktree, counts };
}
