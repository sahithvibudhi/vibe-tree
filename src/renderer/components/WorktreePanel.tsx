import { useEffect, useState, useCallback } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { GitBranch, Plus, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';
import { useToast } from './ui/use-toast';

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

  const confirmDeleteWorktree = async () => {
    if (!worktreeToDelete) return;

    try {
      // Extract branch name from refs/heads/branch-name format
      const branchName = worktreeToDelete.branch.replace('refs/heads/', '');
      
      const result = await window.electronAPI.git.removeWorktree(projectPath, worktreeToDelete.path, branchName);
      
      if (result.warning) {
        toast({
          title: "Warning",
          description: `Worktree deleted but: ${result.warning}`,
          variant: "default",
        });
      } else {
        toast({
          title: "Success",
          description: `Completely deleted worktree and branch ${branchName}`,
        });
      }
      
      if (selectedWorktree === worktreeToDelete.path) {
        const remainingWorktrees = worktrees.filter(w => w.path !== worktreeToDelete.path);
        if (remainingWorktrees.length > 0) {
          onSelectWorktree(remainingWorktrees[0].path);
        }
      }
      
      setShowDeleteDialog(false);
      setWorktreeToDelete(null);
      loadWorktrees();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete worktree",
        variant: "destructive",
      });
      setShowDeleteDialog(false);
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
              >
                <GitBranch className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{worktree.branch}</div>
                  <div className="text-xs text-muted-foreground truncate">{worktree.path}</div>
                </div>
              </button>
              {worktrees.length > 1 && !worktree.branch.includes('main') && !worktree.branch.includes('master') && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 opacity-60 hover:opacity-100 group-hover:opacity-100 transition-opacity bg-red-50 hover:bg-red-100 border border-red-200 hover:border-red-300"
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
                <p className="text-sm text-destructive mt-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Both the worktree directory and git branch will be permanently deleted.
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
            <Button variant="destructive" onClick={confirmDeleteWorktree}>
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
