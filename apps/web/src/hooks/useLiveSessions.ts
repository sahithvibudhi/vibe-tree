import { useEffect, useState } from 'react';
import { useWebSocket } from './useWebSocket';
import { useAppStore } from '../store';

/**
 * Live terminal-session counts per worktree path, kept current by the
 * server's sessions-changed broadcast. Lets the sidebar show which
 * worktrees have an agent running without opening them.
 */
export function useLiveSessions() {
  const { getAdapter } = useWebSocket();
  const { connected } = useAppStore();
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const adapter = getAdapter();
    if (!adapter || !connected) return;

    let cancelled = false;

    adapter
      .getWorktreeSessions()
      .then((counts) => {
        if (!cancelled) setSessionCounts(counts);
      })
      .catch(() => {
        // Broadcast subscription below still corrects the state
      });

    const unsubscribe = adapter.onSessionsChanged((counts) => {
      if (!cancelled) setSessionCounts(counts);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [getAdapter, connected]);

  return sessionCounts;
}
