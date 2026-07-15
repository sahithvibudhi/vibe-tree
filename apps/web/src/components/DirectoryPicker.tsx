import { useEffect, useState } from 'react';
import { X, Folder, FolderGit2, ArrowUp } from 'lucide-react';
import { listServerDirectory, type DirectoryListing } from '../services/fsBrowse';
import { SkeletonRows } from './Skeleton';

interface DirectoryPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}

/**
 * Server-side directory browser for the project picker. Lists directories
 * only; git repositories are the selectable leaves, everything else is
 * navigation.
 */
export function DirectoryPicker({ open, onClose, onSelect }: DirectoryPickerProps) {
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = async (path?: string) => {
    setLoading(true);
    setError(null);
    try {
      setListing(await listServerDirectory(path));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      // Start from the server's home directory on every open
      navigate();
    } else {
      setListing(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-background border rounded-lg shadow-lg w-full max-w-md flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Browse server directories"
        data-testid="directory-picker"
      >
        <div className="p-4 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Browse server</h3>
            <button
              onClick={onClose}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p
            className="font-mono text-xs text-muted-foreground truncate"
            title={listing?.path ?? ''}
          >
            {listing?.path ?? '...'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto min-h-48">
          {loading ? (
            <SkeletonRows rows={5} />
          ) : error ? (
            <p className="p-4 text-xs text-destructive">{error}</p>
          ) : listing ? (
            <div className="divide-y">
              {listing.parent && (
                <button
                  onClick={() => navigate(listing.parent!)}
                  className="w-full flex items-center gap-2.5 px-4 h-10 text-left hover:bg-accent/50 transition-colors"
                >
                  <ArrowUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">..</span>
                </button>
              )}
              {listing.entries.length === 0 && (
                <p className="px-4 py-6 text-xs text-muted-foreground text-center">
                  No subdirectories
                </p>
              )}
              {listing.entries.map((entry) => (
                <div
                  key={entry.path}
                  className="flex items-center gap-2.5 px-4 h-10 hover:bg-accent/50 transition-colors"
                >
                  <button
                    onClick={() => navigate(entry.path)}
                    className="flex-1 min-w-0 flex items-center gap-2.5 text-left"
                    title={entry.path}
                  >
                    {entry.isGitRepo ? (
                      <FolderGit2 className="h-3.5 w-3.5 flex-shrink-0" />
                    ) : (
                      <Folder className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    )}
                    <span
                      className={`text-sm truncate ${entry.isGitRepo ? 'font-medium' : 'text-muted-foreground'}`}
                    >
                      {entry.name}
                    </span>
                  </button>
                  {entry.isGitRepo && (
                    <button
                      onClick={() => onSelect(entry.path)}
                      className="h-6 px-2.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors flex-shrink-0"
                    >
                      Open
                    </button>
                  )}
                </div>
              ))}
              {listing.truncated && (
                <p className="px-4 py-2 text-[11px] text-muted-foreground">
                  Showing the first 200 directories
                </p>
              )}
            </div>
          ) : null}
        </div>

        <div className="p-3 border-t flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            Git repositories can be opened as projects
          </p>
          <button
            onClick={() => listing && onSelect(listing.path)}
            disabled={!listing?.isGitRepo}
            className="h-8 px-3 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            data-testid="open-current-directory"
          >
            Open this folder
          </button>
        </div>
      </div>
    </div>
  );
}
