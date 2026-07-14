import { useState } from 'react';
import { FolderOpen, Plus } from 'lucide-react';

interface ProjectSelectorProps {
  onSelectProject: (path: string) => void;
}

export function ProjectSelector({ onSelectProject }: ProjectSelectorProps) {
  const [projectPath, setProjectPath] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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

  return (
    <div className="flex-1 flex items-center justify-center p-8">
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

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            The path must point to a git repository the server can reach
          </p>
        </div>
      </div>
    </div>
  );
}
