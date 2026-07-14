import { useState } from 'react';
import { FolderOpen, Plus, History, X } from 'lucide-react';
import { useAppStore } from '../store';
import { SHORTCUTS } from '../hooks/useKeyboardShortcuts';
import { KeyChips } from './ShortcutsHelp';

interface ProjectSelectorProps {
  onSelectProject: (path: string) => void;
  onSelectProjects?: (paths: string[]) => void;
}

export function ProjectSelector({ onSelectProject, onSelectProjects }: ProjectSelectorProps) {
  const { recentProjects, removeRecentProject } = useAppStore();
  const [projectPath, setProjectPath] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [checkedPaths, setCheckedPaths] = useState<string[]>([]);

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

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mx-auto">
            <FolderOpen className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">Open a project</h2>
          <p className="text-sm text-muted-foreground">
            Point VibeTree at a git repository on the server. Every task gets its own worktree
            with a persistent terminal for your AI agent.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="projectPath"
              className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Project path
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
          </div>

          <button
            type="submit"
            disabled={isLoading || !projectPath.trim()}
            className="w-full h-9 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="h-4 w-4" />
            {isLoading ? 'Adding Project...' : 'Add Project'}
          </button>
        </form>

        {recentProjects.length > 0 && (
          <div className="space-y-2" data-testid="recent-projects">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <History className="h-3 w-3" />
              Recent projects
            </div>
            <div className="border rounded-md divide-y">
              {recentProjects.map((path) => (
                <label
                  key={path}
                  className="flex items-center gap-2.5 px-3 h-9 cursor-pointer hover:bg-accent/50 transition-colors group"
                >
                  <input
                    type="checkbox"
                    checked={checkedPaths.includes(path)}
                    onChange={() => toggleChecked(path)}
                    className="h-3.5 w-3.5 accent-foreground flex-shrink-0"
                  />
                  <span className="font-mono text-xs truncate flex-1" title={path}>
                    {path}
                  </span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      removeRecentProject(path);
                      setCheckedPaths((current) => current.filter((p) => p !== path));
                    }}
                    className="p-0.5 text-muted-foreground hover:text-foreground rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Remove ${path} from recent projects`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </label>
              ))}
            </div>
            <button
              onClick={openChecked}
              disabled={checkedPaths.length === 0}
              className="w-full h-8 flex items-center justify-center gap-2 border rounded-md text-xs font-medium hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="open-selected-projects"
            >
              Open selected{checkedPaths.length > 0 ? ` (${checkedPaths.length})` : ''}
            </button>
          </div>
        )}

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            The path must point to a git repository the server can reach
          </p>
        </div>

        <div className="pt-2 border-t space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center">
            Keyboard shortcuts
          </p>
          <ul className="space-y-1.5">
            {SHORTCUTS.map((shortcut) => (
              <li
                key={shortcut.action}
                className="flex items-center justify-between gap-4 text-xs text-muted-foreground"
              >
                <span>{shortcut.action}</span>
                <KeyChips keys={shortcut.keys} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
