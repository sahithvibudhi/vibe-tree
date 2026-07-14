import { useCallback, useEffect, useRef, useState } from 'react';
import type { Worktree } from '@vibetree/core';
import { useWebSocket } from './useWebSocket';
import { useAppStore } from '../store';

/**
 * Changed-file counts per worktree path, so the sidebar can answer
 * "which worktree has uncommitted work" without opening each one.
 * Refreshes when the worktree list changes and when the app regains
 * visibility, since agents keep editing while the tab is hidden.
 */
export function useWorktreeStatuses(worktrees: Worktree[]) {
  const { getAdapter } = useWebSocket();
  const { connected } = useAppStore();
  const [changeCounts, setChangeCounts] = useState<Record<string, number>>({});
  // Serialize refreshes so a slow batch cannot clobber a newer one
  const refreshSeq = useRef(0);

  const paths = worktrees.map((w) => w.path).join('\n');

  const refresh = useCallback(async () => {
    const adapter = getAdapter();
    if (!adapter || !connected || worktrees.length === 0) return;

    const seq = ++refreshSeq.current;
    const entries = await Promise.all(
      worktrees.map(async (worktree) => {
        try {
          const status = await adapter.getGitStatus(worktree.path);
          return [worktree.path, status.length] as const;
        } catch {
          // Leave unknown rather than falsely reporting clean
          return [worktree.path, -1] as const;
        }
      })
    );
    if (seq !== refreshSeq.current) return;

    const next: Record<string, number> = {};
    for (const [path, count] of entries) {
      if (count >= 0) next[path] = count;
    }
    setChangeCounts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAdapter, connected, paths]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  return { changeCounts, refreshStatuses: refresh };
}
