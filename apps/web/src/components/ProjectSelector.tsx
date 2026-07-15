import { useEffect, useState } from 'react';
import { FolderGit2, FolderSearch, Plus, X } from 'lucide-react';
import { useAppStore } from '../store';
import { SHORTCUTS } from '../hooks/useKeyboardShortcuts';
import { KeyChips } from './ShortcutsHelp';
import { DirectoryPicker } from './DirectoryPicker';
import { discoverServerRepos, type DiscoveredRepo } from '../services/fsBrowse';

interface ProjectSelectorProps {
  onSelectProject: (path: string) => void;
  onSelectProjects?: (paths: string[]) => void;
}

/**
 * Landing screen, laid out like the VS Code / Cursor welcome page:
 * brand and the open-project form on the left, recent projects as
 * name-first clickable rows on the right.
 */
export function ProjectSelector({ onSelectProject, onSelectProjects }: ProjectSelectorProps) {
  const { recentProjects, removeRecentProject } = useAppStore();
  const [projectPath, setProjectPath] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [checkedPaths, setCheckedPaths] = useState<string[]>([]);
  const [showBrowser, setShowBrowser] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredRepo[] | null>(null);

  // Repos the server found near its configured roots; best-effort, the
  // landing page works fine without it
  useEffect(() => {
    let cancelled = false;
    discoverServerRepos()
      .then((repos) => {
        if (!cancelled) setDiscovered(repos);
      })
      .catch(() => {
        if (!cancelled) setDiscovered([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!projectPath.trim()) {
      setError('Please enter a project path');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      onSelectProject(projectPath.trim());
    } catch (err) {
      setError('Failed to add project. Please check the path.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleChecked = (path: string) => {
    setCheckedPaths((current) =>
      current.includes(path) ? current.filter((p) => p !== path) : [...current, path]
    );
  };

  const openChecked = () => {
    if (checkedPaths.length === 0) return;
    if (onSelectProjects) {
      onSelectProjects(checkedPaths);
    } else {
      checkedPaths.forEach((path) => onSelectProject(path));
    }
    setCheckedPaths([]);
  };

  const projectName = (path: string) => path.split('/').filter(Boolean).pop() || path;

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-4xl grid md:grid-cols-2 gap-x-16 gap-y-10 items-start">
          {/* Brand + open form */}
          <div className="space-y-8">
            <div className="space-y-3">
              <h2 className="text-3xl font-semibold tracking-tight">VibeTree</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Run every AI coding agent in its own git worktree, in parallel. Works with Claude
                Code, Codex, Gemini CLI, Aider, or any terminal program.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <label
                htmlFor="projectPath"
                className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Open a project
              </label>
              <input
                id="projectPath"
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/path/to/your/project"
                className="w-full h-9 px-3 font-mono border border-input bg-background rounded-md text-[13px] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/15 focus:border-foreground/30"
                disabled={isLoading}
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isLoading || !projectPath.trim()}
                  className="flex-1 h-9 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  {isLoading ? 'Adding Project...' : 'Add Project'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowBrowser(true)}
                  className="h-9 px-3 flex items-center justify-center gap-2 border rounded-md text-sm font-medium hover:bg-accent transition-colors"
                  data-testid="browse-server"
                >
                  <FolderSearch className="h-4 w-4" />
                  Browse...
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                The path must point to a git repository the server can reach
              </p>
            </form>
          </div>

          {/* Recent projects */}
          <div className="space-y-2">
            <div className="flex items-center justify-between h-6">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recent
              </span>
              {checkedPaths.length > 0 && (
                <button
                  onClick={openChecked}
                  className="h-6 px-2.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                  data-testid="open-selected-projects"
                >
                  Open selected ({checkedPaths.length})
                </button>
              )}
            </div>

            {recentProjects.length === 0 ? (
              <div className="border border-dashed rounded-md px-4 py-10 text-center">
                <FolderGit2 className="h-6 w-6 mx-auto mb-2 text-muted-foreground opacity-50" />
                <p className="text-xs text-muted-foreground">
                  Projects you open appear here for quick access
                </p>
              </div>
            ) : (
              <div className="border rounded-md divide-y" data-testid="recent-projects">
                {recentProjects.map((path) => (
                  <div
                    key={path}
                    className="group flex items-center gap-3 px-3 h-12 hover:bg-accent/50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checkedPaths.includes(path)}
                      onChange={() => toggleChecked(path)}
                      className="h-3.5 w-3.5 accent-foreground flex-shrink-0"
                      aria-label={`Select ${projectName(path)}`}
                    />
                    <button
                      onClick={() => onSelectProject(path)}
                      className="flex-1 min-w-0 text-left"
                      title={`Open ${path}`}
                    >
                      <span className="block text-sm font-medium truncate">
                        {projectName(path)}
                      </span>
                      <span className="block text-[11px] font-mono text-muted-foreground truncate">
                        {path}
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        removeRecentProject(path);
                        setCheckedPaths((current) => current.filter((p) => p !== path));
                      }}
                      className="p-1 text-muted-foreground hover:text-foreground rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label={`Remove ${path} from recent projects`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {recentProjects.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Click a project to open it, or select several and open them together
              </p>
            )}

            {/* Repos the server discovered near its roots, minus ones
                already in recents */}
            {discovered && discovered.filter((r) => !recentProjects.includes(r.path)).length > 0 && (
              <div className="pt-4 space-y-2" data-testid="discovered-repos">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  On this server
                </span>
                <div className="border rounded-md divide-y">
                  {discovered
                    .filter((repo) => !recentProjects.includes(repo.path))
                    .slice(0, 5)
                    .map((repo) => (
                      <button
                        key={repo.path}
                        onClick={() => onSelectProject(repo.path)}
                        className="w-full flex items-center gap-3 px-3 h-12 hover:bg-accent/50 transition-colors text-left"
                        title={`Open ${repo.path}`}
                      >
                        <FolderGit2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium truncate">{repo.name}</span>
                          <span className="block text-[11px] font-mono text-muted-foreground truncate">
                            {repo.path}
                          </span>
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <DirectoryPicker
        open={showBrowser}
        onClose={() => setShowBrowser(false)}
        onSelect={(path) => {
          setShowBrowser(false);
          onSelectProject(path);
        }}
      />

      {/* Shortcuts strip; pointless on touch screens, so desktop only */}
      <div className="hidden md:block border-t px-8 py-3">
        <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.action} className="flex items-center gap-2 text-xs text-muted-foreground">
              <KeyChips keys={shortcut.keys} />
              {shortcut.action}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
