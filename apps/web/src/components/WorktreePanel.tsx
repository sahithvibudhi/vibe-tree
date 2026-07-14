import { useAppStore } from '../store';
import { useWebSocket } from '../hooks/useWebSocket';
import { useWorktreeStatuses } from '../hooks/useWorktreeStatuses';
import { useLiveSessions } from '../hooks/useLiveSessions';
import { ChevronLeft, GitBranch, RefreshCw, Plus, Check } from 'lucide-react';
import { useState, useEffect } from 'react';

interface WorktreePanelProps {
  projectId: string;
}

/**
 * Mirrors git check-ref-format so invalid names are caught with a readable
 * message before the server rejects them with a cryptic git error.
 */
export function validateBranchName(name: string): string | null {
  if (/\s/.test(name)) return 'Branch names cannot contain spaces';
  if (name.startsWith('-') || name.startsWith('.') || name.startsWith('/'))
    return 'Branch names cannot start with "-", "." or "/"';
  if (name.endsWith('/') || name.endsWith('.') || name.endsWith('.lock'))
    return 'Branch names cannot end with "/", "." or ".lock"';
  if (name.includes('..') || name.includes('//') || name.includes('@{'))
    return 'Branch names cannot contain "..", "//" or "@{"';
  // eslint-disable-next-line no-control-regex
  if (/[~^:?*[\\\x00-\x1f\x7f]/.test(name))
    return 'Branch names cannot contain ~ ^ : ? * [ \\ or control characters';
  return null;
}

export function WorktreePanel({ projectId }: WorktreePanelProps) {
  const { getProject, updateProjectWorktrees, setSelectedWorktree, connected, addToast } =
    useAppStore();

  const { getAdapter } = useWebSocket();
  const [loading, setLoading] = useState(false);
  const [showNewBranchDialog, setShowNewBranchDialog] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  const branchNameError = newBranchName.trim() ? validateBranchName(newBranchName.trim()) : null;

  const project = getProject(projectId);
  const adapter = getAdapter(); // Get adapter once per render
  const { changeCounts, refreshStatuses } = useWorktreeStatuses(project?.worktrees ?? []);
  const sessionCounts = useLiveSessions();

  const handleRefresh = async () => {
    const adapter = getAdapter();
    if (!adapter || !connected || !project || loading) return;

    setLoading(true);
    try {
      const trees = await adapter.listWorktrees(project.path);
      updateProjectWorktrees(projectId, trees);
      refreshStatuses();
    } catch (error) {
      console.error('Failed to refresh worktrees:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectWorktree = (path: string) => {
    console.log('WorktreePanel: Selecting worktree:', {
      projectId,
      path,
      currentSelection: project?.selectedWorktree
    });
    setSelectedWorktree(projectId, path);
  };

  const handleBack = () => {
    setSelectedWorktree(projectId, null);
  };

  const handleCreateBranch = async () => {
    const adapter = getAdapter();
    if (!newBranchName.trim() || branchNameError || !adapter || !connected || !project) return;

    setLoading(true);
    try {
      const result = await adapter.addWorktree(project.path, newBranchName.trim());
      if (result.hook && !result.hook.ok) {
        addToast(
          `post-create hook failed: ${result.hook.timedOut ? 'timed out' : `exit code ${result.hook.exitCode}`}`,
          'error'
        );
      }

      setShowNewBranchDialog(false);
      setNewBranchName('');
      addToast(`Worktree ${newBranchName.trim()} created`, 'success');

      // Refresh worktrees to show the new one
      const trees = await adapter.listWorktrees(project.path);
      updateProjectWorktrees(projectId, trees);
      refreshStatuses();

      // Select the newly created worktree
      setSelectedWorktree(projectId, result.path);
    } catch (error) {
      addToast(
        `Failed to create worktree: ${error instanceof Error ? error.message : 'unknown error'}`,
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  // Auto-load worktrees when component mounts or project changes
  useEffect(() => {
    console.log('WorktreePanel useEffect triggered:', {
      projectId,
      connected,
      loading,
      hasProject: !!project,
      hasAdapter: !!adapter,
      projectPath: project?.path,
      currentWorktrees: project?.worktrees?.length || 0
    });

    if (!project || !connected || loading || !adapter) {
      console.log('Early return from useEffect:', {
        hasProject: !!project,
        connected,
        loading,
        hasAdapter: !!adapter
      });
      return;
    }

    // Inline refresh logic with stable dependencies
    const loadWorktrees = async () => {
      console.log('Starting worktree load for:', project.path);
      setLoading(true);

      try {
        const trees = await adapter.listWorktrees(project.path);
        console.log('Worktrees loaded:', trees);
        updateProjectWorktrees(projectId, trees);
        console.log('Project worktrees updated');
      } catch (error) {
        console.error('Failed to load worktrees:', error);
      } finally {
        setLoading(false);
        console.log('Loading finished');
      }
    };

    loadWorktrees();
  }, [projectId, connected, adapter?.constructor?.name]); // Stable dependency on adapter presence

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Project not found
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      {/* Panel Header */}
      <div className="h-9 px-3 border-b flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* Back button on mobile when terminal is selected */}
          {project.selectedWorktree && (
            <button
              onClick={handleBack}
              className="md:hidden p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
              aria-label="Back"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <h2
            className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate"
            title={project.path}
          >
            Worktrees
            <span className="ml-1.5 font-normal">{project.worktrees.length}</span>
          </h2>
        </div>
        <div className="flex gap-0.5">
          <button
            onClick={handleRefresh}
            disabled={!connected || loading}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded disabled:opacity-50"
            aria-label="Refresh worktrees"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowNewBranchDialog(true)}
            disabled={!connected}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded disabled:opacity-50"
            aria-label="Create worktree"
            data-testid="create-worktree"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Worktree List */}
      <div className="flex-1 overflow-y-auto">
        {!connected ? (
          <div className="p-4 text-center text-muted-foreground">
            <p className="text-sm">Not connected to server</p>
          </div>
        ) : project.worktrees.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            <p className="text-sm">No worktrees found</p>
            <p className="text-xs mt-2">Click the + button to create worktrees</p>
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {[...project.worktrees]
              .sort((a, b) => {
                // Extract branch names, handling refs/heads/ prefix and detached HEAD
                const getBranchName = (wt: typeof a) => {
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
                console.log('Rendering worktree:', {
                  branch: worktree.branch,
                  path: worktree.path,
                  isSelected: project.selectedWorktree === worktree.path
                });
                const isSelected = project.selectedWorktree === worktree.path;
                const changeCount = changeCounts[worktree.path];
                const liveSessions = sessionCounts[worktree.path] ?? 0;
                return (
                  <button
                    key={worktree.path}
                    onClick={() => handleSelectWorktree(worktree.path)}
                    className={`w-full text-left px-2 py-1.5 rounded-md transition-colors flex items-center gap-2 ${
                      isSelected
                        ? 'bg-accent text-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                    }`}
                  >
                    <GitBranch
                      className="h-3.5 w-3.5 flex-shrink-0"
                    />
                    <span className="font-mono text-[13px] font-medium truncate">
                      {worktree.branch
                        ? worktree.branch.replace('refs/heads/', '')
                        : `detached (${worktree.head.substring(0, 8)})`}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                      {liveSessions > 0 && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-green-500"
                          title={`${liveSessions} live terminal session${liveSessions === 1 ? '' : 's'}`}
                          data-testid="live-session-dot"
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
                );
              })}
          </div>
        )}
      </div>

      {/* Create New Branch Dialog */}
      {showNewBranchDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-background border rounded-lg shadow-lg w-full max-w-md">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-2">Create New Feature Branch</h3>
              <p className="text-sm text-muted-foreground mb-4">
                This will create a new git worktree for parallel development
              </p>

              <input
                type="text"
                placeholder="feature-name"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateBranch();
                  }
                  if (e.key === 'Escape') {
                    setShowNewBranchDialog(false);
                    setNewBranchName('');
                  }
                }}
                className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                autoFocus
              />
              {branchNameError && (
                <p className="text-xs text-destructive mt-2" role="alert">
                  {branchNameError}
                </p>
              )}

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => {
                    setShowNewBranchDialog(false);
                    setNewBranchName('');
                  }}
                  className="px-4 py-2 text-sm border border-border rounded-md hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateBranch}
                  disabled={!newBranchName.trim() || !!branchNameError || loading}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Branch'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
