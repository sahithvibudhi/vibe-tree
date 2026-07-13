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
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
            <FolderOpen className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold">Select a Project</h2>
          <p className="text-muted-foreground">
            Enter the path to your git repository to start working with Claude in parallel worktrees
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="projectPath" className="text-sm font-medium">
              Project Path
            </label>
            <input
              id="projectPath"
              type="text"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              placeholder="/path/to/your/project"
              className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              disabled={isLoading}
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={isLoading || !projectPath.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="h-4 w-4" />
            {isLoading ? 'Adding Project...' : 'Add Project'}
          </button>
        </form>

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Make sure the path points to a valid git repository
          </p>
        </div>
      </div>
    </div>
  );
}
