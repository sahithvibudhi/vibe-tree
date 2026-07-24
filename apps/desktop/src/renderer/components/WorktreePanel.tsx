import { useEffect, useState, useCallback } from 'react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Check, GitBranch, Plus, RefreshCw, Trash2, Clock } from 'lucide-react';
import { useToast } from './ui/use-toast';
import { isProtectedBranch } from '../utils/worktree';
import { DeletionReportingDialog } from './DeletionReportingDialog';
import { activeSchedulersByWorktree, SCHEDULER_STATE_CHANGED_EVENT } from './ClaudeTerminal';
import { cleanupWorktreeTerminals } from './TerminalGrid';
import { backend } from '../services/backend';

interface Worktree {
  path: string;
  branch: string;
  head: string;
}

interface WorktreePanelProps {
  projectPath: string;
  selectedWorktree: string | null;
  onSelectWorktree: (path: string) => void;
  onWorktreesChange?: (worktrees: Worktree[]) => void;
  initialWorktrees?: Worktree[];
}

export function WorktreePanel({
  projectPath,
  selectedWorktree,
  onSelectWorktree,
  onWorktreesChange,
  initialWorktrees
}: WorktreePanelProps) {
  const [worktrees, setWorktrees] = useState<Worktree[]>(initialWorktrees || []);
  const [refreshing, setRefreshing] = useState(false);
  const [showNewBranchDialog, setShowNewBranchDialog] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [worktreeToDelete, setWorktreeToDelete] = useState<Worktree | null>(null);
  const [showDeletionReporting, setShowDeletionReporting] = useState(false);
  const [deletionBranchName, setDeletionBranchName] = useState('');
  const [deletionWorktreePath, setDeletionWorktreePath] = useState('');
  const [deletionSteps, setDeletionSteps] = useState<
    Array<{
      message: string;
      status: 'pending' | 'in-progress' | 'success' | 'error';
      error?: string;
    }>
  >([]);
  const [isDeletionComplete, setIsDeletionComplete] = useState(false);
  const [changeCounts, setChangeCounts] = useState<Record<string, number>>({});
  const [panelWidth, setPanelWidth] = useState<number>(320); // Default 320px (w-80)
  const [isResizing, setIsResizing] = useState(false);
  const [worktreeSessionCounts, setWorktreeSessionCounts] = useState<Record<string, number>>({});
  const [worktreesWithSchedulers, setWorktreesWithSchedulers] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const loadWorktrees = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await backend.git.listWorktrees(projectPath);
      // Detached HEAD worktrees have no branch; the panel shows them by path
      const trees = result.map((t) => ({ path: t.path, head: t.head, branch: t.branch ?? '' }));
      setWorktrees(trees);
      onWorktreesChange?.(trees);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load worktrees. Make sure this is a git repository.',
        variant: 'destructive'
      });
    }
    setRefreshing(false);
  }, [projectPath, toast, onWorktreesChange]);

  useEffect(() => {
    loadWorktrees();
  }, [loadWorktrees]);

  // Fired by the Worktree menu accelerator; only the active project's panel
  // is mounted, so this cannot open dialogs for background projects
  useEffect(() => {
    const openDialog = () => setShowNewBranchDialog(true);
    window.addEventListener('vibetree:new-worktree', openDialog);
    return () => window.removeEventListener('vibetree:new-worktree', openDialog);
  }, []);

  useEffect(() => {
    if (initialWorktrees && initialWorktrees.length > 0) {
      setWorktrees(initialWorktrees);
    }
  }, [initialWorktrees]);

  // Changed-file counts per worktree, mirroring the web sidebar's
  // clean/dirty indicator; refreshed with the worktree list and when the
  // window regains visibility since agents keep editing in the background
  useEffect(() => {
    let cancelled = false;

    const refreshStatuses = async () => {
      const entries = await Promise.all(
        worktrees.map(async (worktree) => {
          try {
            const status = await backend.git.status(worktree.path);
            return [worktree.path, status.length] as const;
          } catch {
            // Leave unknown rather than falsely reporting clean
            return [worktree.path, -1] as const;
          }
        })
      );
      if (cancelled) return;
      const next: Record<string, number> = {};
      for (const [path, count] of entries) {
        if (count >= 0) next[path] = count;
      }
      setChangeCounts(next);
    };

    refreshStatuses();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshStatuses();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [worktrees]);

  // Listen for terminal session changes
  useEffect(() => {
    // Load initial session counts
    backend.shell.getWorktreeSessions().then(setWorktreeSessionCounts);

    // Subscribe to session changes
    const unsubscribe = backend.shell.onSessionsChanged((sessions) => {
      setWorktreeSessionCounts(sessions);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Listen for scheduler state changes
  useEffect(() => {
    const updateSchedulerStatus = () => {
      // Use the activeSchedulersByWorktree map directly
      const worktreesWithActiveSchedulers = new Set<string>(activeSchedulersByWorktree.keys());
      setWorktreesWithSchedulers(worktreesWithActiveSchedulers);
    };

    // Initial check
    updateSchedulerStatus();

    // Listen for scheduler state changes
    const handleSchedulerChange = () => {
      updateSchedulerStatus();
    };

    window.addEventListener(SCHEDULER_STATE_CHANGED_EVENT, handleSchedulerChange);

    return () => {
      window.removeEventListener(SCHEDULER_STATE_CHANGED_EVENT, handleSchedulerChange);
    };
  }, []);

  // Load panel width from localStorage on mount
  useEffect(() => {
    const savedWidth = localStorage.getItem('worktreePanelWidth');
    if (savedWidth) {
      const width = parseInt(savedWidth, 10);
      if (!isNaN(width)) {
        setPanelWidth(width);
      }
    }
  }, []);

  // Save panel width to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('worktreePanelWidth', panelWidth.toString());
  }, [panelWidth]);

  // Handle resize mouse events
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = e.clientX;
      // Constrain width between 200px and 600px
      const constrainedWidth = Math.max(200, Math.min(600, newWidth));
      setPanelWidth(constrainedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return;

    try {
      const result = await backend.git.addWorktree(projectPath, newBranchName);
      if (result.hook && !result.hook.ok) {
        toast({
          title: 'Worktree created, post-create hook failed',
          description: result.hook.timedOut
            ? 'The .vibetree/hooks/post-create script timed out.'
            : `The .vibetree/hooks/post-create script exited with code ${result.hook.exitCode}.`,
          variant: 'destructive'
        });
      } else {
        toast({
          title: 'Success',
          description: result.hook
            ? `Created worktree for branch ${result.branch} (post-create hook ran)`
            : `Created worktree for branch ${result.branch}`
        });
      }
      setShowNewBranchDialog(false);
      setNewBranchName('');
      loadWorktrees();
      onSelectWorktree(result.path);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create worktree',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteWorktree = (worktree: Worktree, event: React.MouseEvent) => {
    event.stopPropagation();

    if (worktrees.length <= 1) {
      toast({
        title: 'Error',
        description: 'Cannot delete the only remaining worktree',
        variant: 'destructive'
      });
      return;
    }

    setWorktreeToDelete(worktree);
    setShowDeleteDialog(true);
  };

  const updateDeletionStep = (index: number, updates: Partial<(typeof deletionSteps)[0]>) => {
    setDeletionSteps((prev) => {
      const newSteps = [...prev];
      newSteps[index] = { ...newSteps[index], ...updates };
      return newSteps;
    });
  };

  const confirmDeleteWorktree = async () => {
    if (!worktreeToDelete) return;

    // Store branch and path for the deletion dialog
    const branchName = worktreeToDelete.branch.replace('refs/heads/', '');
    const worktreePath = worktreeToDelete.path;
    setDeletionBranchName(branchName);
    setDeletionWorktreePath(worktreePath);

    // Close confirmation dialog and show deletion reporting dialog
    setShowDeleteDialog(false);

    // Initialize deletion steps
    const steps = [
      { message: 'Killing terminal processes...', status: 'pending' as const },
      { message: 'Running pre-remove hook...', status: 'pending' as const },
      { message: 'Removing worktree directory...', status: 'pending' as const },
      { message: 'Deleting git branch...', status: 'pending' as const }
    ];
    setDeletionSteps(steps);
    setIsDeletionComplete(false);
    setShowDeletionReporting(true);

    try {
      // Step 1: Kill all terminal processes for this worktree
      updateDeletionStep(0, { status: 'in-progress' });
      try {
        const result = await backend.shell.terminateForWorktree(worktreeToDelete.path);
        updateDeletionStep(0, {
          status: 'success',
          message: `Killed ${result.count} terminal process(es)`
        });
      } catch (error) {
        updateDeletionStep(0, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to kill terminal processes'
        });
      }

      // Clean up terminal DOM cache for this worktree
      // This prevents stale terminals from appearing when worktree is recreated
      cleanupWorktreeTerminals(worktreeToDelete.path);

      // Step 2-4: pre-remove hook, worktree removal, and branch deletion all
      // happen inside removeWorktree; step statuses are set from its result
      updateDeletionStep(1, { status: 'in-progress' });
      updateDeletionStep(2, { status: 'in-progress' });
      updateDeletionStep(3, { status: 'in-progress' });

      try {
        const result = await backend.git.removeWorktree(
          projectPath,
          worktreeToDelete.path,
          branchName
        );

        if (!result.hook) {
          updateDeletionStep(1, { status: 'success', message: 'No pre-remove hook configured' });
        } else if (result.hook.ok) {
          updateDeletionStep(1, { status: 'success', message: 'Pre-remove hook completed' });
        } else {
          // A failing hook warns but never blocks the deletion
          updateDeletionStep(1, {
            status: 'error',
            error: result.hook.timedOut
              ? 'Pre-remove hook timed out (deletion continued)'
              : `Pre-remove hook exited with code ${result.hook.exitCode} (deletion continued)`
          });
        }

        updateDeletionStep(2, { status: 'success' });

        const branchWarning =
          result.warning && result.warning.includes('failed to delete branch')
            ? result.warning
            : undefined;
        if (branchWarning) {
          updateDeletionStep(3, {
            status: 'error',
            error: branchWarning
          });
        } else {
          updateDeletionStep(3, { status: 'success' });
        }
      } catch (error) {
        updateDeletionStep(1, { status: 'error' });
        updateDeletionStep(2, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to remove worktree'
        });
        updateDeletionStep(3, { status: 'error' });
      }

      // Switch to another worktree if the deleted one was selected
      if (selectedWorktree === worktreeToDelete.path) {
        const remainingWorktrees = worktrees.filter((w) => w.path !== worktreeToDelete.path);
        if (remainingWorktrees.length > 0) {
          onSelectWorktree(remainingWorktrees[0].path);
        }
      }

      // Reload worktrees
      loadWorktrees();
    } catch (error) {
      console.error('Unexpected error during deletion:', error);
    } finally {
      setIsDeletionComplete(true);
      setWorktreeToDelete(null);
    }
  };

  return (
    <div className="border-r flex flex-col h-full relative" style={{ width: `${panelWidth}px` }}>
      <div className="h-[57px] px-4 border-b flex-shrink-0 flex flex-col justify-center">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Worktrees
          </h3>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={loadWorktrees}
              disabled={refreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setShowNewBranchDialog(true)}
              data-testid="add-worktree-button"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground truncate">{projectPath}</p>
      </div>

      <ScrollArea className="flex-1 h-0">
        <div className="p-2">
          {[...worktrees]
            .sort((a, b) => {
              // Extract branch names, handling refs/heads/ prefix and detached HEAD
              const getBranchName = (wt: Worktree) => {
                if (!wt.branch) return wt.head.substring(0, 8); // detached HEAD
                return wt.branch.replace('refs/heads/', '');
              };

              const branchA = getBranchName(a);
              const branchB = getBranchName(b);

              // Keep main or master first
              if (branchA === 'main' || branchA === 'master') return -1;
              if (branchB === 'main' || branchB === 'master') return 1;

              // Sort alphabetically for the rest
              return branchA.localeCompare(branchB);
            })
            .map((worktree) => {
              const isSelected = selectedWorktree === worktree.path;
              const canDelete =
                worktrees.length > 1 && !!worktree.branch && !isProtectedBranch(worktree.branch);
              const changeCount = changeCounts[worktree.path];
              return (
                <div key={worktree.path} className="relative group">
                  <button
                    onClick={() => onSelectWorktree(worktree.path)}
                    className={`w-full text-left px-2 py-1.5 rounded-md transition-colors flex items-center gap-2 ${
                      isSelected
                        ? 'bg-accent text-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                    }`}
                    data-worktree-branch={
                      worktree.branch
                        ? worktree.branch.replace('refs/heads/', '')
                        : worktree.head.substring(0, 8)
                    }
                  >
                    <GitBranch className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="font-mono text-[13px] font-medium truncate">
                      {worktree.branch
                        ? worktree.branch.replace('refs/heads/', '')
                        : `detached (${worktree.head.substring(0, 8)})`}
                    </span>
                    <span
                      className={`ml-auto flex items-center gap-1.5 flex-shrink-0 transition-opacity ${
                        canDelete ? 'group-hover:opacity-0' : ''
                      }`}
                    >
                      {worktreesWithSchedulers.has(worktree.path) && (
                        <Clock className="h-3 w-3 opacity-60" aria-label="Scheduler active" />
                      )}
                      {worktreeSessionCounts[worktree.path] > 0 && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-green-500"
                          data-testid="live-session-dot"
                          aria-label="Live session"
                        />
                      )}
                      {changeCount !== undefined &&
                        (changeCount > 0 ? (
                          <span
                            className="min-w-5 h-4 px-1 inline-flex items-center justify-center rounded-full border text-[10px] font-medium tabular-nums"
                            title={`${changeCount} changed file${changeCount === 1 ? '' : 's'}`}
                          >
                            {changeCount}
                          </span>
                        ) : (
                          <Check className="h-3 w-3 opacity-40" aria-label="Clean worktree" />
                        ))}
                    </span>
                  </button>
                  {canDelete && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
                      onClick={(e) => handleDeleteWorktree(worktree, e)}
                      data-testid="delete-worktree-button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
        </div>
      </ScrollArea>

      <Dialog open={showNewBranchDialog} onOpenChange={setShowNewBranchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Feature Branch</DialogTitle>
            <DialogDescription>
              Creates a git worktree on its own branch, so an agent can work there in isolation
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="feature-name"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateBranch();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewBranchDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateBranch} disabled={!newBranchName.trim()}>
              Create Branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Worktree</DialogTitle>
            <DialogDescription>
              This will permanently delete the worktree and branch. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {worktreeToDelete && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
                <p className="text-sm">
                  <strong>Branch:</strong> {worktreeToDelete.branch.replace('refs/heads/', '')}
                </p>
                <p className="text-sm">
                  <strong>Path:</strong> {worktreeToDelete.path}
                </p>
                <p className="text-sm text-destructive mt-2">
                   Both the worktree directory and git branch will be permanently deleted.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setWorktreeToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-red-600 hover:bg-red-700"
              onClick={confirmDeleteWorktree}
            >
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeletionReportingDialog
        open={showDeletionReporting}
        branchName={deletionBranchName}
        worktreePath={deletionWorktreePath}
        steps={deletionSteps}
        isComplete={isDeletionComplete}
        onClose={() => {
          setShowDeletionReporting(false);
          setDeletionSteps([]);
          setIsDeletionComplete(false);
          setDeletionBranchName('');
          setDeletionWorktreePath('');
        }}
      />

      {/* Resize handle */}
      <div
        className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 ${
          isResizing ? 'bg-blue-500' : 'bg-transparent'
        } transition-colors`}
        onMouseDown={handleResizeMouseDown}
        title="Drag to resize"
      />
    </div>
  );
}
