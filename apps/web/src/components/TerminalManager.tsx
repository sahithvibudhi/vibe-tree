import { useEffect, useRef, useState } from 'react';
import { TerminalView } from './TerminalView';

interface TerminalManagerProps {
  worktrees: Array<{ path: string; branch?: string; head: string }>;
  selectedWorktree: string | null;
}

// Component cache to maintain terminal instances
// const terminalComponents = new Map<string, React.ComponentType>();

export function TerminalManager({ worktrees, selectedWorktree }: TerminalManagerProps) {
  const [mountedTerminals, setMountedTerminals] = useState<Set<string>>(new Set());

  // Track which terminals have been created
  const createdTerminals = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedWorktree) return;

    // Mount the selected terminal if it hasn't been mounted yet
    if (!mountedTerminals.has(selectedWorktree)) {
      setMountedTerminals((prev) => new Set(prev).add(selectedWorktree));
      createdTerminals.current.add(selectedWorktree);
    }
  }, [selectedWorktree, mountedTerminals]);

  // Clean up terminals for worktrees that no longer exist
  useEffect(() => {
    const currentWorktreePaths = new Set(worktrees.map((w) => w.path));
    const terminalsToRemove = Array.from(createdTerminals.current).filter(
      (path) => !currentWorktreePaths.has(path)
    );

    if (terminalsToRemove.length > 0) {
      setMountedTerminals((prev) => {
        const next = new Set(prev);
        terminalsToRemove.forEach((path) => {
          next.delete(path);
          createdTerminals.current.delete(path);
        });
        return next;
      });
    }
  }, [worktrees]);

  if (!selectedWorktree) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <p className="text-lg mb-2">Select a worktree to start</p>
          <p className="text-sm">Choose from the panel on the left</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {Array.from(mountedTerminals).map((worktreePath) => (
        <div
          key={worktreePath}
          style={{
            display: selectedWorktree === worktreePath ? 'block' : 'none',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%'
          }}
        >
          <TerminalView worktreePath={worktreePath} />
        </div>
      ))}
    </div>
  );
}
