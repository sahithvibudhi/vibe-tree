import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, FileText, Send, Maximize2, Minimize2, X } from 'lucide-react';
import { Skeleton, SkeletonRows } from './Skeleton';
import { DiffView, DiffModeEnum } from '@git-diff-view/react';
import '@git-diff-view/react/styles/diff-view.css';
// import { useAppStore } from '../store';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAppStore } from '../store';
import type { GitStatus } from '@vibetree/core';

interface GitFile {
  path: string;
  status: string;
  staged: boolean;
  modified: boolean;
}

interface GitDiffViewProps {
  worktreePath: string;
  theme?: 'light' | 'dark';
  maximized: boolean;
  onToggleMaximize: () => void;
  onClose: () => void;
}

export function GitDiffView({ worktreePath, theme = 'light', maximized, onToggleMaximize, onClose }: GitDiffViewProps) {
  const [files, setFiles] = useState<GitFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffText, setDiffText] = useState<string>('');
  const [viewMode, setViewMode] = useState<'unstaged' | 'staged'>('unstaged');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const { getAdapter } = useWebSocket();
  const { terminalSessions, addToast } = useAppStore();

  // Sends a review note about the selected file straight into this
  // worktree's terminal, so pointing the agent at a problem does not
  // require leaving the diff
  const sendNoteToAgent = async () => {
    const adapter = getAdapter();
    const sessionId = terminalSessions.get(worktreePath);
    if (!note.trim() || !adapter || !selectedFile) return;
    if (!sessionId) {
      addToast('Open this worktree\'s terminal first, then send the note', 'error');
      return;
    }
    try {
      await adapter.writeToShell(sessionId, `In ${selectedFile}: ${note.trim()}\r`);
      addToast('Note sent to the agent', 'success');
      setNote('');
    } catch (err) {
      addToast(
        `Failed to send note: ${err instanceof Error ? err.message : 'unknown error'}`,
        'error'
      );
    }
  };

  const loadGitStatus = useCallback(async () => {
    const adapter = getAdapter();
    if (!adapter) return;

    try {
      setLoading(true);
      setError(null);

      const status: GitStatus[] = await adapter.getGitStatus(worktreePath);

      // Convert GitStatus to GitFile format
      const gitFiles: GitFile[] = status.map((file) => ({
        path: file.path,
        status: file.status,
        staged: file.status[0] !== ' ' && file.status[0] !== '?',
        modified: file.status[1] !== ' ' && file.status[1] !== '?'
      }));

      setFiles(gitFiles);

      if (gitFiles.length > 0 && !selectedFile) {
        setSelectedFile(gitFiles[0].path);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load git status');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [worktreePath, selectedFile, getAdapter]);

  const loadDiff = useCallback(
    async (filePath: string, staged: boolean = false) => {
      const adapter = getAdapter();
      if (!adapter) return;

      try {
        setLoading(true);
        setError(null);

        const diffTextResult = staged
          ? await adapter.getGitDiffStaged(worktreePath, filePath)
          : await adapter.getGitDiff(worktreePath, filePath);

        // Handle undefined/null results safely
        setDiffText(diffTextResult ? diffTextResult.trim() : '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load diff');
        setDiffText('');
      } finally {
        setLoading(false);
      }
    },
    [worktreePath, getAdapter]
  );

  useEffect(() => {
    if (worktreePath) {
      loadGitStatus();
    }
  }, [worktreePath, loadGitStatus]);

  useEffect(() => {
    if (selectedFile) {
      const file = files.find((f) => f.path === selectedFile);
      if (file) {
        const shouldLoadStaged = viewMode === 'staged' && file.staged;
        const shouldLoadUnstaged = viewMode === 'unstaged' && file.modified;

        if (shouldLoadStaged || shouldLoadUnstaged) {
          loadDiff(selectedFile, viewMode === 'staged');
        } else {
          setDiffText('');
        }
      }
    }
  }, [selectedFile, viewMode, files, loadDiff]);

  const getStatusIcon = (status: string) => {
    switch (status[0]) {
      case 'M':
        return <span className="text-blue-500">M</span>;
      case 'A':
        return <span className="text-green-500">A</span>;
      case 'D':
        return <span className="text-red-500">D</span>;
      case 'R':
        return <span className="text-yellow-500">R</span>;
      case 'C':
        return <span className="text-cyan-500">C</span>;
      case '?':
        return <span className="text-gray-500">?</span>;
      default:
        return <span className="text-gray-400">{status[0] || ' '}</span>;
    }
  };

  const filteredFiles = files.filter((file) => {
    if (viewMode === 'staged') return file.staged;
    if (viewMode === 'unstaged') return file.modified;
    return true;
  });

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Drawer header: identity, staged toggle, and pane controls */}
      <div className="h-9 px-3 border-b flex items-center justify-between gap-2 flex-shrink-0 bg-background">
        <h3
          className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate"
          title={worktreePath}
        >
          Changes
          <span className="ml-1.5 font-normal">{filteredFiles.length}</span>
        </h3>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
            <button
              className={`px-2.5 h-6 text-xs font-medium rounded transition-colors ${
                viewMode === 'unstaged'
                  ? 'bg-background text-foreground border shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setViewMode('unstaged')}
            >
              Unstaged
            </button>
            <button
              className={`px-2.5 h-6 text-xs font-medium rounded transition-colors ${
                viewMode === 'staged'
                  ? 'bg-background text-foreground border shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setViewMode('staged')}
            >
              Staged
            </button>
          </div>
          <button
            onClick={loadGitStatus}
            disabled={loading}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors disabled:opacity-50"
            aria-label="Refresh changes"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onToggleMaximize}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
            title={maximized ? 'Restore drawer' : 'Maximize changes'}
            aria-label={maximized ? 'Restore drawer' : 'Maximize changes'}
            data-testid="changes-maximize"
          >
            {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
            title="Close changes"
            aria-label="Close changes"
            data-testid="changes-close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className={`flex-1 flex min-h-0 overflow-hidden ${maximized ? 'flex-row' : 'flex-col'}`}>
        {/* File List: a column beside the diff when maximized, a compact
            band above it in the drawer */}
        <div
          className={`flex flex-col min-w-0 ${
            maximized ? 'w-80 border-r' : 'max-h-48 border-b flex-shrink-0'
          }`}
        >
          <div className="flex-1 overflow-auto">
            <div className="p-2 space-y-1">
              {loading && filteredFiles.length === 0 ? (
                <SkeletonRows rows={4} />
              ) : filteredFiles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No {viewMode} changes</p>
                </div>
              ) : (
                filteredFiles.map((file) => (
                  <div
                    key={file.path}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-muted/50 transition-colors ${
                      selectedFile === file.path ? 'bg-muted' : ''
                    }`}
                    onClick={() => setSelectedFile(file.path)}
                  >
                    <span className="font-mono text-xs w-4 text-center">
                      {getStatusIcon(file.status)}
                    </span>
                    <span className="text-sm truncate flex-1" title={file.path}>
                      {file.path}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Diff View */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {selectedFile && (
            <div className="border-b px-3 h-11 flex items-center gap-2 flex-shrink-0">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') sendNoteToAgent();
                }}
                placeholder={`Tell the agent about ${selectedFile.split('/').pop()}...`}
                className="flex-1 h-7 px-2.5 text-xs border border-input bg-background rounded focus:outline-none focus:ring-2 focus:ring-ring/15 focus:border-foreground/30"
                data-testid="diff-note-input"
              />
              <button
                onClick={sendNoteToAgent}
                disabled={!note.trim()}
                className="h-7 px-2.5 inline-flex items-center gap-1.5 text-xs font-medium border rounded hover:bg-accent disabled:opacity-50 transition-colors"
                data-testid="diff-note-send"
              >
                <Send className="h-3 w-3" />
                Send to agent
              </button>
            </div>
          )}
          {error ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-sm text-destructive mb-2">Error loading diff</p>
                <p className="text-xs text-muted-foreground">{error}</p>
                <button
                  onClick={loadGitStatus}
                  className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                >
                  <RefreshCw className="h-4 w-4 mr-2 inline" />
                  Retry
                </button>
              </div>
            </div>
          ) : !selectedFile ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Select a file to view changes</p>
              </div>
            </div>
          ) : !diffText ? (
            loading ? (
              <div className="flex-1 p-4 space-y-2" data-testid="diff-skeleton">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No {viewMode} changes for this file</p>
                </div>
              </div>
            )
          ) : (
            <div className="flex-1 overflow-auto w-full">
              <div className="p-4 w-full overflow-hidden">
                <DiffView
                  data={{
                    oldFile: {
                      fileName: selectedFile || '',
                      content: null
                    },
                    newFile: {
                      fileName: selectedFile || '',
                      content: null
                    },
                    hunks: [diffText]
                  }}
                  diffViewMode={DiffModeEnum.Split}
                  diffViewTheme={theme}
                  diffViewHighlight={true}
                  diffViewWrap={true}
                  className="w-full"
                  style={{ maxWidth: '100%', overflow: 'hidden' }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
