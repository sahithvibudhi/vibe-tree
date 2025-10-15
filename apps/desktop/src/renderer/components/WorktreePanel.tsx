import { useEffect, useState, useCallback } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { GitBranch, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useToast } from './ui/use-toast';
import { isProtectedBranch } from '../utils/worktree';
import { DeletionReportingDialog } from './DeletionReportingDialog';

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
  const { toast } = useToast();

  const loadWorktrees = useCallback(async () => {
    setLoading(true);
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
    setLoading(false);
  }, [projectPath, toast, onWorktreesChange]);

  useEffect(() => {
    loadWorktrees();
  }, [loadWorktrees]);

  useEffect(() => {
    if (initialWorktrees && initialWorktrees.length > 0) {
      setWorktrees(initialWorktrees);
    }
  }, [initialWorktrees]);

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

  return (
    <div className="w-80 border-r flex flex-col h-full">
      <div className="h-[57px] px-4 border-b flex-shrink-0 flex flex-col justify-center">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Worktrees</h3>
          <div className="flex gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={loadWorktrees}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowNewBranchDialog(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground truncate">{projectPath}</p>
      </div>

      <ScrollArea className="flex-1 h-0">
        <div className="p-2">
          {worktrees.map((worktree) => (
            <div
              key={worktree.path}
              className={`relative group rounded-md transition-colors ${
                selectedWorktree === worktree.path
                  ? 'bg-accent'
                  : 'hover:bg-accent/50'
              }`}
            >
              <button
                onClick={() => onSelectWorktree(worktree.path)}
                className="w-full text-left p-3 flex items-center gap-1.5"
                data-worktree-branch={worktree.branch ? worktree.branch.replace('refs/heads/', '') : worktree.head.substring(0, 8)}
              >
                <GitBranch className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {worktree.branch 
                      ? worktree.branch.replace('refs/heads/', '')
                      : `Detached HEAD (${worktree.head.substring(0, 8)})`}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {worktree.path.replace('/Users/dots/Documents/projects/', '')}
                  </div>
                </div>
              </button>
              {worktrees.length > 1 && worktree.branch && !isProtectedBranch(worktree.branch) && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="relative right-2 top-1/2 -translate-y-1/2 h-6 w-6 opacity-60 hover:opacity-100 group-hover:opacity-100 transition-opacity bg-red-50 hover:bg-red-100 border border-red-200 hover:border-red-300"
                  onClick={(e) => handleDeleteWorktree(worktree, e)}
                >
                  <Trash2 className="h-3 w-3 text-red-600" />
                </Button>
              )}
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
    </div>
  );
}