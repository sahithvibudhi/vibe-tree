import { useEffect } from 'react';
import { useAppStore } from '../store';

export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export const MOD_LABEL = IS_MAC ? 'Cmd' : 'Ctrl';

export interface ShortcutDescription {
  keys: string[];
  action: string;
}

// Single source for the help overlay, the welcome screen, and the handler
export const SHORTCUTS: ShortcutDescription[] = [
  { keys: [MOD_LABEL, 'Shift', 'K'], action: 'New worktree' },
  { keys: [MOD_LABEL, 'Shift', 'E'], action: 'Toggle the Changes drawer' },
  { keys: [MOD_LABEL, 'Alt', 'Up/Down'], action: 'Previous / next worktree' },
  { keys: ['?'], action: 'Show keyboard shortcuts' }
];

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest('input, textarea, select, [contenteditable="true"]');
}

/**
 * App-wide shortcuts. Modifier combos work even when the terminal has
 * focus (they are not printable, so nothing leaks into the PTY); the
 * bare "?" only fires outside editable elements so typing is unaffected.
 */
export function useKeyboardShortcuts(onShowHelp: () => void) {
  const { getActiveProject, setSelectedTab, setSelectedWorktree, requestNewWorktree } =
    useAppStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.shiftKey && !e.altKey && e.code === 'KeyK') {
        e.preventDefault();
        requestNewWorktree();
        return;
      }

      if (mod && e.shiftKey && !e.altKey && e.code === 'KeyE') {
        const project = getActiveProject();
        if (!project) return;
        e.preventDefault();
        setSelectedTab(project.id, project.selectedTab === 'terminal' ? 'changes' : 'terminal');
        return;
      }

      if (mod && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const project = getActiveProject();
        if (!project || project.worktrees.length === 0) return;
        e.preventDefault();
        const paths = project.worktrees.map((w) => w.path);
        const currentIndex = project.selectedWorktree
          ? paths.indexOf(project.selectedWorktree)
          : -1;
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = (currentIndex + delta + paths.length) % paths.length;
        setSelectedWorktree(project.id, paths[nextIndex]);
        return;
      }

      if (e.key === '?' && !mod && !e.altKey && !isEditableTarget(e.target)) {
        e.preventDefault();
        onShowHelp();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [getActiveProject, setSelectedTab, setSelectedWorktree, requestNewWorktree, onShowHelp]);
}
