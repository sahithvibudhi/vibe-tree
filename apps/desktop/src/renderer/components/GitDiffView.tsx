import { useEffect, useState, useCallback } from 'react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { RefreshCw, FileText } from 'lucide-react';
import { DiffView, DiffModeEnum } from '@git-diff-view/react';
import '@git-diff-view/react/styles/diff-view.css';
import { backend } from '../services/backend';

interface GitFile {
  path: string;
  status: string;
  staged: boolean;
  modified: boolean;
}

interface GitDiffViewProps {
  worktreePath: string;
  theme?: 'light' | 'dark';
}

export function GitDiffView({ worktreePath, theme = 'light' }: GitDiffViewProps) {
  const [files, setFiles] = useState<GitFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffText, setDiffText] = useState<string>('');
  const [viewMode, setViewMode] = useState<'unstaged' | 'staged'>('unstaged');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGitStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const status = await backend.git.status(worktreePath);
      setFiles(status);
      if (status.length > 0 && !selectedFile) {
        setSelectedFile(status[0].path);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load git status');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [worktreePath, selectedFile]);

  const loadDiff = useCallback(
    async (filePath: string, staged: boolean = false) => {
      try {
        setLoading(true);
        setError(null);
        const diffTextResult = staged
          ? await backend.git.diffStaged(worktreePath, filePath)
          : await backend.git.diff(worktreePath, filePath);

        setDiffText(diffTextResult.trim());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load diff');
        setDiffText('');
      } finally {
        setLoading(false);
      }
    },
    [worktreePath]
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
      <div className="h-[57px] px-4 border-b flex items-center justify-between flex-shrink-0">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Git Changes</h3>
          <p className="text-xs text-muted-foreground truncate">{worktreePath}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-md">
            <Button
              size="sm"
              variant={viewMode === 'unstaged' ? 'default' : 'ghost'}
              onClick={() => setViewMode('unstaged')}
              className="rounded-r-none"
            >
              Unstaged
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'staged' ? 'default' : 'ghost'}
              onClick={() => setViewMode('staged')}
              className="rounded-l-none"
            >
              Staged
            </Button>
          </div>
          <Button size="icon" variant="ghost" onClick={loadGitStatus} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="w-80 border-r flex flex-col min-w-0">
          <div className="p-3 border-b bg-muted/50">
            <h4 className="text-sm font-medium">
              {viewMode === 'staged' ? 'Staged Changes' : 'Unstaged Changes'} (
              {filteredFiles.length})
            </h4>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {filteredFiles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No {viewMode} changes</p>
                </div>
              ) : (
                filteredFiles.map((file) => (
                  <div
                    key={file.path}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-muted/50 ${
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
          </ScrollArea>
        </div>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {error ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-sm text-destructive mb-2">Error loading diff</p>
                <p className="text-xs text-muted-foreground">{error}</p>
                <Button size="sm" onClick={loadGitStatus} className="mt-4">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
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
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No {viewMode} changes for this file</p>
              </div>
            </div>
          ) : (
            <ScrollArea className="flex-1 w-full">
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
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
