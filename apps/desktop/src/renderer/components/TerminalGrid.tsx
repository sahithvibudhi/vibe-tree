import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createHtmlPortalNode, InPortal, OutPortal, HtmlPortalNode } from 'react-reverse-portal';
import { ClaudeTerminal } from './ClaudeTerminal';
import { TerminalController } from '../services/TerminalController';

interface TerminalManagerProps {
  worktreePath: string;
  projectId?: string;
  theme?: 'light' | 'dark';
}

interface TerminalInstance {
  id: string;
  worktreePath: string;
  portalNode: HtmlPortalNode;
  processId?: string;
}

// Grid node can be either a terminal or a split container
type GridNode = TerminalLeaf | SplitContainer;

interface TerminalLeaf {
  type: 'terminal';
  id: string;
  terminal: TerminalInstance;
}

interface SplitContainer {
  type: 'split';
  id: string;
  direction: 'horizontal' | 'vertical';
  children: [GridNode, GridNode]; // Always exactly 2 children
  splitRatio?: number; // Default 0.5 (50/50 split)
}

interface WorktreeGrid {
  worktreePath: string;
  root: GridNode;
}

// Global cache for terminal grids - persists across component re-renders
const worktreeGridCache = new Map<string, WorktreeGrid>();

/**
 * Clean up terminal grid cache for a worktree when it's deleted.
 * This prevents stale terminal DOM nodes from persisting after worktree deletion.
 */
export function cleanupWorktreeTerminals(worktreePath: string): void {
  if (worktreeGridCache.has(worktreePath)) {
    console.log(`[TerminalGrid] Cleaning up terminal cache for worktree: ${worktreePath}`);
    worktreeGridCache.delete(worktreePath);
  }
}

// Helper to find a node in the grid by terminal ID
function findNodeAndParent(
  node: GridNode,
  terminalId: string,
  parent: SplitContainer | null = null
): { node: GridNode; parent: SplitContainer | null } | null {
  if (node.type === 'terminal' && node.terminal.id === terminalId) {
    return { node, parent };
  }

  if (node.type === 'split') {
    for (const child of node.children) {
      const result = findNodeAndParent(child, terminalId, node);
      if (result) return result;
    }
  }

  return null;
}

// Helper to collect all terminals from the grid
function collectTerminals(node: GridNode): TerminalInstance[] {
  if (node.type === 'terminal') {
    return [node.terminal];
  }

  const terminals: TerminalInstance[] = [];
  for (const child of node.children) {
    terminals.push(...collectTerminals(child));
  }
  return terminals;
}

// Helper to count terminals in a node
function countTerminals(node: GridNode): number {
  if (node.type === 'terminal') {
    return 1;
  }
  return node.children.reduce((sum, child) => sum + countTerminals(child), 0);
}

export function TerminalGrid({ worktreePath, projectId, theme }: TerminalManagerProps) {
  const [worktreeGrids, setWorktreeGrids] = useState<Map<string, WorktreeGrid>>(worktreeGridCache);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalProcessIds = useRef<Map<string, string>>(new Map());
  const terminalsBeingClosed = useRef<Set<string>>(new Set());

  // Initialize terminal controller
  const terminalControllerRef = useRef<TerminalController>();
  if (!terminalControllerRef.current) {
    terminalControllerRef.current = new TerminalController(window.electronAPI.shell, {
      onCleanupSuccess: (terminalId) => {
        console.log(`[TerminalGrid] PTY cleanup successful for terminal: ${terminalId}`);
        terminalProcessIds.current.delete(terminalId);
        terminalsBeingClosed.current.delete(terminalId);

        // Actually close the terminal now that process is cleaned up
        const grid = worktreeGridCache.get(worktreePath);
        if (grid) {
          closeTerminalFromGrid(grid, terminalId);
        }
      },
      onCleanupError: (terminalId, error) => {
        console.error(`[TerminalGrid] PTY cleanup failed for terminal ${terminalId}:`, error);
        terminalProcessIds.current.delete(terminalId);
        terminalsBeingClosed.current.delete(terminalId);
      }
    });
  }

  // Create or get grid for current worktree
  useEffect(() => {
    if (!worktreeGridCache.has(worktreePath)) {
      console.log('Creating initial terminal for:', worktreePath);

      // Create a new terminal instance for this worktree
      const terminalId = `${worktreePath}-${Date.now()}`;
      const portalNode = createHtmlPortalNode();
      const terminal: TerminalInstance = {
        id: terminalId,
        worktreePath,
        portalNode
      };

      const worktreeData: WorktreeGrid = {
        worktreePath,
        root: {
          type: 'terminal',
          id: terminalId,
          terminal
        }
      };

      // Add to global cache
      worktreeGridCache.set(worktreePath, worktreeData);

      // Update state to trigger re-render
      setWorktreeGrids(new Map(worktreeGridCache));
    }
  }, [worktreePath]);

  // Handle terminal split
  const handleSplit = useCallback((terminalId: string, direction: 'horizontal' | 'vertical') => {
    const grid = worktreeGridCache.get(worktreePath);
    if (!grid) return;


    // Find the terminal node to split
    const result = findNodeAndParent(grid.root, terminalId);
    if (!result) return;

    const { node, parent } = result;
    if (node.type !== 'terminal') return;

    // Create a new terminal instance
    const newTerminalId = `${worktreePath}-${Date.now()}`;
    const portalNode = createHtmlPortalNode();
    const newTerminal: TerminalInstance = {
      id: newTerminalId,
      worktreePath,
      portalNode
    };

    // Create new terminal leaf
    const newTerminalLeaf: TerminalLeaf = {
      type: 'terminal',
      id: newTerminalId,
      terminal: newTerminal
    };

    // Create split container with the original and new terminal
    const splitContainer: SplitContainer = {
      type: 'split',
      id: `split-${Date.now()}`,
      direction,
      children: [node, newTerminalLeaf],
      splitRatio: 0.5
    };

    // Replace the terminal node with the split container
    if (!parent) {
      // This is the root node
      grid.root = splitContainer;
    } else {
      // Replace in parent's children
      const childIndex = parent.children.indexOf(node);
      if (childIndex !== -1) {
        parent.children[childIndex] = splitContainer;
      }
    }

    // Force a new grid reference to ensure React detects the change
    worktreeGridCache.set(worktreePath, { ...grid });

    // Update state to trigger re-render
    setWorktreeGrids(new Map(worktreeGridCache));


    // Force a resize event after a short delay to ensure DOM is updated
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 50);
  }, [worktreePath]);

  // Helper function to close terminal from grid
  const closeTerminalFromGrid = useCallback((grid: WorktreeGrid, terminalId: string) => {
    // Find the terminal node and its parent
    const result = findNodeAndParent(grid.root, terminalId);
    if (!result) return;

    const { node, parent } = result;
    if (!parent) {
      // Can't close the root if it's the only terminal
      return;
    }

    // Find the sibling node
    const siblingIndex = parent.children[0] === node ? 1 : 0;
    const sibling = parent.children[siblingIndex];

    // Find parent's parent to replace parent with sibling
    if (grid.root === parent) {
      // Parent is root, replace root with sibling
      grid.root = sibling;
    } else {
      // Find parent's parent and replace
      const findParentOfParent = (n: GridNode, target: SplitContainer): SplitContainer | null => {
        if (n.type === 'split') {
          if (n.children.includes(target)) {
            return n;
          }
          for (const child of n.children) {
            const result = findParentOfParent(child, target);
            if (result) return result;
          }
        }
        return null;
      };

      const parentOfParent = findParentOfParent(grid.root, parent);
      if (parentOfParent) {
        const parentIndex = parentOfParent.children.indexOf(parent);
        if (parentIndex !== -1) {
          parentOfParent.children[parentIndex] = sibling;
        }
      }
    }

    // Force a new grid reference to ensure React detects the change
    worktreeGridCache.set(worktreePath, { ...grid });

    // Update state to trigger re-render
    setWorktreeGrids(new Map(worktreeGridCache));
  }, [worktreePath]);

  // Handle terminal close - terminates PTY process immediately with SIGKILL
  const handleClose = useCallback((terminalId: string) => {
    const grid = worktreeGridCache.get(worktreePath);
    if (!grid) return;

    // Don't allow closing if it's the last terminal
    const totalTerminals = countTerminals(grid.root);
    if (totalTerminals <= 1) {
      console.log('Cannot close the last terminal');
      return;
    }

    // Don't allow closing if already being closed
    if (terminalsBeingClosed.current.has(terminalId)) {
      console.log('Terminal is already being closed:', terminalId);
      return;
    }

    console.log('Initiating close for terminal:', terminalId);
    terminalsBeingClosed.current.add(terminalId);

    // Clean up PTY process - UI will be updated when cleanup succeeds
    const processId = terminalProcessIds.current.get(terminalId);
    if (processId && terminalControllerRef.current) {
      terminalControllerRef.current.handleTerminalClose({
        terminalId,
        processId
      }).catch(async (error) => {
        console.error('PTY cleanup error for terminal:', terminalId, error);

        // Show error dialog to user with detailed backtrace and wait for them to acknowledge
        let errorDetails = '';
        if (error instanceof Error) {
          errorDetails = error.stack || error.message;
        } else {
          errorDetails = String(error);
        }

        await window.electronAPI.dialog.showError(
          'Terminal Close Error',
          `Failed to close terminal cleanly:\n\n${errorDetails}\n\nThe terminal will be removed from the UI.`
        );

        // After user acknowledges the error, proceed with cleanup
        terminalsBeingClosed.current.delete(terminalId);
        terminalProcessIds.current.delete(terminalId);
        closeTerminalFromGrid(grid, terminalId);
      });
    } else {
      // No process ID, close immediately
      closeTerminalFromGrid(grid, terminalId);
      terminalsBeingClosed.current.delete(terminalId);
    }
  }, [worktreePath, closeTerminalFromGrid]);

  // Callback to track process IDs from terminals
  const handleTerminalProcessId = useCallback((terminalId: string, processId: string) => {
    if (processId) {
      terminalProcessIds.current.set(terminalId, processId);
    }
  }, []);

  // Get current grid
  const currentGrid = useMemo(() => {
    return worktreeGrids.get(worktreePath);
  }, [worktreeGrids, worktreePath]);

  // Get all terminals from current grid
  const currentTerminals = useMemo(() => {
    if (!currentGrid) return [];
    const terminals = collectTerminals(currentGrid.root);
    return terminals;
  }, [currentGrid]);

  // Get all terminals from all worktrees for rendering InPortals
  const allTerminals = useMemo(() => {
    const terminals: TerminalInstance[] = [];
    worktreeGrids.forEach(grid => {
      terminals.push(...collectTerminals(grid.root));
    });
    return terminals;
  }, [worktreeGrids]);

  // Render a grid node recursively
  const renderGridNode = useCallback((node: GridNode): JSX.Element => {
    if (node.type === 'terminal') {
      return (
        <div
          key={`out-${node.terminal.id}`}
          className="terminal-outportal-wrapper relative flex flex-col h-full w-full min-h-0 min-w-0 overflow-hidden"
        >
          <OutPortal node={node.terminal.portalNode} />
        </div>
      );
    }

    // Split container
    const isHorizontal = node.direction === 'horizontal';
    const splitRatio = node.splitRatio || 0.5;

    return (
      <div
        key={`split-${node.id}`}
        className={`flex h-full w-full ${isHorizontal ? 'flex-col' : 'flex-row'} overflow-hidden`}
        style={{ position: 'relative' }}
      >
        <div
          className={`relative ${isHorizontal ? 'min-h-0 flex-shrink-0' : 'min-w-0 flex-shrink-0'} overflow-hidden`}
          style={isHorizontal ? {
            height: `${splitRatio * 100}%`,
            maxHeight: `${splitRatio * 100}%`,
            borderBottom: '1px solid var(--border)'
          } : {
            width: `${splitRatio * 100}%`,
            maxWidth: `${splitRatio * 100}%`,
            borderRight: '1px solid var(--border)'
          }}
        >
          {renderGridNode(node.children[0])}
        </div>
        <div
          className={`relative ${isHorizontal ? 'min-h-0 flex-grow' : 'min-w-0 flex-grow'} overflow-hidden`}
          style={isHorizontal ? {
            height: `${(1 - splitRatio) * 100}%`,
            maxHeight: `${(1 - splitRatio) * 100}%`
          } : {
            width: `${(1 - splitRatio) * 100}%`,
            maxWidth: `${(1 - splitRatio) * 100}%`
          }}
        >
          {renderGridNode(node.children[1])}
        </div>
      </div>
    );
  }, []);

  // Watch for DOM changes and trigger resize when terminals are added/removed
  useEffect(() => {
    if (!containerRef.current) return;

    // Create a MutationObserver to watch for DOM changes
    const observer = new MutationObserver((mutations) => {
      // Check if any terminals were added or removed
      const hasStructuralChange = mutations.some(mutation =>
        mutation.type === 'childList' &&
        (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)
      );

      if (hasStructuralChange) {
        // Trigger a resize event to ensure all terminals fit properly
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
        }, 100);
      }
    });

    // Start observing the container for child changes
    observer.observe(containerRef.current, {
      childList: true,
      subtree: true
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="terminal-manager-root flex-1 h-full relative overflow-hidden">
      {/* Render all terminals into their portals (this happens once per terminal) */}
      {allTerminals.map((terminal) => {
        const isCurrentTerminal = currentTerminals.some(t => t.id === terminal.id);
        const canCloseTerminal = isCurrentTerminal && currentTerminals.length > 1;

        return (
          <InPortal key={terminal.id} node={terminal.portalNode}>
            <ClaudeTerminal
              worktreePath={terminal.worktreePath}
              projectId={projectId}
              theme={theme}
              terminalId={terminal.id}
              isVisible={isCurrentTerminal}
              onSplitVertical={() => handleSplit(terminal.id, 'vertical')}
              onSplitHorizontal={() => handleSplit(terminal.id, 'horizontal')}
              onClose={() => handleClose(terminal.id)}
              canClose={canCloseTerminal}
              onProcessIdChange={(processId) => handleTerminalProcessId(terminal.id, processId)}
            />
          </InPortal>
        );
      })}

      {/* Render the grid layout */}
      {currentGrid && (
        <div className="h-full w-full overflow-hidden" style={{ position: 'absolute', inset: 0 }}>
          {renderGridNode(currentGrid.root)}
        </div>
      )}
    </div>
  );
}