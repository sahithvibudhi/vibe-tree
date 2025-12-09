import { useEffect, useState, useCallback } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { GitBranch, Plus, RefreshCw, Trash2, Clock } from 'lucide-react';
import { useToast } from './ui/use-toast';
import { isProtectedBranch } from '../utils/worktree';
import { DeletionReportingDialog } from './DeletionReportingDialog';
import type { TerminalSettings } from '../types/terminal-settings';
import { activeSchedulersByWorktree, SCHEDULER_STATE_CHANGED_EVENT } from './ClaudeTerminal';
import { cleanupWorktreeTerminals } from './TerminalGrid';

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

export function WorktreePanel({ projectPath, selectedWorktree, onSelectWorktree, onWorktreesChange, initialWorktrees }: WorktreePanelProps) {
  const [worktrees, setWorktrees] = useState<Worktree[]>(initialWorktrees || []);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showNewBranchDialog, setShowNewBranchDialog] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [worktreeToDelete, setWorktreeToDelete] = useState<Worktree | null>(null);
  const [showDeletionReporting, setShowDeletionReporting] = useState(false);
  const [deletionBranchName, setDeletionBranchName] = useState('');
  const [deletionWorktreePath, setDeletionWorktreePath] = useState('');
  const [deletionSteps, setDeletionSteps] = useState<Array<{
    message: string;
    status: 'pending' | 'in-progress' | 'success' | 'error';
    error?: string;
  }>>([]);
  const [isDeletionComplete, setIsDeletionComplete] = useState(false);
  const [terminalSettings, setTerminalSettings] = useState<TerminalSettings | null>(null);
  const [panelWidth, setPanelWidth] = useState<number>(320); // Default 320px (w-80)
  const [isResizing, setIsResizing] = useState(false);
  const [worktreeSessionCounts, setWorktreeSessionCounts] = useState<Record<string, number>>({});
  const [worktreesWithSchedulers, setWorktreesWithSchedulers] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const loadWorktrees = useCallback(async () => {
    setRefreshing(true);
    try {
      const trees = await window.electronAPI.git.listWorktrees(projectPath);
      setWorktrees(trees);
      onWorktreesChange?.(trees);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load worktrees. Make sure this is a git repository.",
        variant: "destructive",
      });
    }
    setRefreshing(false);
  }, [projectPath, toast, onWorktreesChange]);


  const handleCreateStressTest = async () => {
    setLoading(true);
    try {
      toast({
        title: "Stress test started!",
        description: "Creating worktrees and opening terminals until we hit errors...",
      });

      let index = 1;
      let consecutiveFailures = 0;

      // Keep creating worktrees and opening terminals until we hit errors
      while (consecutiveFailures < 3) {
        try {
          // Create one worktree using the same method as the regular add button
          const branchName = `stress-test-${String(index).padStart(4, '0')}`;
          const wtResult = await window.electronAPI.git.addWorktree(projectPath, branchName);

          consecutiveFailures = 0; // Reset on success

          // Switch to this worktree to activate it and show the terminal
          onSelectWorktree(wtResult.path);

          // Open terminal for this worktree immediately
          const shellResult = await window.electronAPI.shell.start(wtResult.path, 80, 30, true);

          if (!shellResult.success) {
            console.error(`Failed to open terminal for worktree ${index}:`, shellResult.error);
            toast({
              title: "PTY spawn error detected!",
              description: `Hit spawn error after ${index} terminals. Test complete.`,
              variant: "destructive",
            });
            setLoading(false);
            await loadWorktrees();
            return;
          }

          // Update toast and reload worktrees every 10 worktrees
          if (index % 10 === 0) {
            toast({
              title: "Stress test in progress...",
              description: `Created ${index} worktrees with terminals`,
            });
            // Reload worktree list to show progress
            await loadWorktrees();
          }

          index++;

          // Small delay to let UI breathe
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          console.error(`Error creating worktree ${index}:`, error);
          consecutiveFailures++;
          if (consecutiveFailures >= 3) {
            toast({
              title: "Worktree creation stopped",
              description: `Hit errors after creating ${index - 1} worktrees`,
              variant: "destructive",
            });
            break;
          }
          index++;
        }
      }

      toast({
        title: "Stress test complete!",
        description: `Created ${index - 1} worktrees with terminals`,
      });

      await loadWorktrees();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to run stress test",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    loadWorktrees();
  }, [loadWorktrees]);

  useEffect(() => {
    if (initialWorktrees && initialWorktrees.length > 0) {
      setWorktrees(initialWorktrees);
    }
  }, [initialWorktrees]);

  // Load terminal settings to calculate worktree font size
  useEffect(() => {
    window.electronAPI.terminalSettings.get().then(setTerminalSettings);

    const unsubscribe = window.electronAPI.terminalSettings.onChange((newSettings) => {
      setTerminalSettings(newSettings);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Listen for terminal session changes
  useEffect(() => {
    // Load initial session counts
    window.electronAPI.shell.getWorktreeSessions().then(setWorktreeSessionCounts);

    // Subscribe to session changes
    const unsubscribe = window.electronAPI.shell.onSessionsChanged((sessions) => {
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
      const result = await window.electronAPI.git.addWorktree(projectPath, newBranchName);
      toast({
        title: "Success",
        description: `Created worktree for branch ${result.branch}`,
      });
      setShowNewBranchDialog(false);
      setNewBranchName('');
      loadWorktrees();
      onSelectWorktree(result.path);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create worktree",
        variant: "destructive",
      });
    }
  };

  const handleDeleteWorktree = (worktree: Worktree, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (worktrees.length <= 1) {
      toast({
        title: "Error",
        description: "Cannot delete the only remaining worktree",
        variant: "destructive",
      });
      return;
    }

    setWorktreeToDelete(worktree);
    setShowDeleteDialog(true);
  };

  const updateDeletionStep = (index: number, updates: Partial<typeof deletionSteps[0]>) => {
    setDeletionSteps(prev => {
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
      { message: 'Removing worktree directory...', status: 'pending' as const },
      { message: 'Deleting git branch...', status: 'pending' as const },
    ];
    setDeletionSteps(steps);
    setIsDeletionComplete(false);
    setShowDeletionReporting(true);

    try {
      // Step 1: Kill all terminal processes for this worktree
      updateDeletionStep(0, { status: 'in-progress' });
      try {
        const result = await window.electronAPI.shell.terminateForWorktree(worktreeToDelete.path);
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

      // Step 2: Remove worktree and delete branch
      updateDeletionStep(1, { status: 'in-progress' });
      updateDeletionStep(2, { status: 'in-progress' });

      try {
        const result = await window.electronAPI.git.removeWorktree(
          projectPath,
          worktreeToDelete.path,
          branchName
        );

        updateDeletionStep(1, { status: 'success' });

        if (result.warning) {
          updateDeletionStep(2, {
            status: 'error',
            error: result.warning
          });
        } else {
          updateDeletionStep(2, { status: 'success' });
        }
      } catch (error) {
        updateDeletionStep(1, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to remove worktree'
        });
        updateDeletionStep(2, { status: 'error' });
      }

      // Switch to another worktree if the deleted one was selected
      if (selectedWorktree === worktreeToDelete.path) {
        const remainingWorktrees = worktrees.filter(w => w.path !== worktreeToDelete.path);
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

  // Calculate worktree font size as 150% of terminal font size
  const worktreeFontSize = terminalSettings ? terminalSettings.fontSize * 1.5 : 21; // Default to 21px (150% of 14px)

  return (
    <div className="border-r flex flex-col h-full relative" style={{ width: `${panelWidth}px` }}>
      <div className="h-[57px] px-4 border-b flex-shrink-0 flex flex-col justify-center">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Worktrees</h3>
          <div className="flex gap-2">
            {/* DEBUG only: Stress test button to create worktrees until hitting errors */}
            {process.env.NODE_ENV === 'development' && (
              <Button
                variant="default"
                onClick={handleCreateStressTest}
                disabled={loading}
                title="Create stress test repo and open all terminals until we hit errors"
              >
                [Explode]
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={loadWorktrees}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowNewBranchDialog(true)}
              data-testid="add-worktree-button"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground truncate">{projectPath}</p>
      </div>

      <ScrollArea className="flex-1 h-0">
        <div className="p-2">
          {[...worktrees].sort((a, b) => {
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
          }).map((worktree) => (
            <div
              key={worktree.path}
              className={`relative group rounded-md transition-colors ${
                selectedWorktree === worktree.path
                  ? 'bg-accent'
                  : 'hover:bg-accent/50'
              }`}
            >
              {worktrees.length > 1 && worktree.branch && !isProtectedBranch(worktree.branch) && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-6 w-6 opacity-60 hover:opacity-100 group-hover:opacity-100 transition-opacity bg-red-50 hover:bg-red-100 border border-red-200 hover:border-red-300"
                  onClick={(e) => handleDeleteWorktree(worktree, e)}
                >
                  <Trash2 className="h-3 w-3 text-red-600" />
                </Button>
              )}
              <button
                onClick={() => onSelectWorktree(worktree.path)}
                className="w-full text-left p-3 flex items-center gap-1.5 pl-10"
                data-worktree-branch={worktree.branch ? worktree.branch.replace('refs/heads/', '') : worktree.head.substring(0, 8)}
              >
                {worktreesWithSchedulers.has(worktree.path) && (
                  <Clock className="h-4 w-4 text-blue-500 flex-shrink-0" />
                )}
                <GitBranch className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div
                    className="truncate"
                    style={{
                      fontSize: `${worktreeFontSize}px`,
                      fontWeight: 'bold',
                      color: worktreeSessionCounts[worktree.path] > 0 ? '#60a5fa' : undefined
                    }}
                  >
                    {worktree.branch
                      ? worktree.branch.replace('refs/heads/', '')
                      : `Detached HEAD (${worktree.head.substring(0, 8)})`}
                  </div>
                </div>
              </button>
            </div>
          ))}
        </div>
      </ScrollArea>

      <Dialog open={showNewBranchDialog} onOpenChange={setShowNewBranchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Feature Branch</DialogTitle>
            <DialogDescription>
              This will create a new git worktree for parallel development with Claude
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
                  ⚠️ Both the worktree directory and git branch will be permanently deleted.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowDeleteDialog(false);
              setWorktreeToDelete(null);
            }}>
              Cancel
            </Button>
            <Button variant="default" className="bg-red-600 hover:bg-red-700" onClick={confirmDeleteWorktree}>
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