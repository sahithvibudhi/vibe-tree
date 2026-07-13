import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { FolderOpen, Clock } from 'lucide-react';

interface ProjectSelectorProps {
  onSelectProject: (path: string) => void;
}

interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
}

export function ProjectSelector({ onSelectProject }: ProjectSelectorProps) {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);

  useEffect(() => {
    window.electronAPI.recentProjects
      .get()
      .then(setRecentProjects)
      .catch(() => setRecentProjects([]));
  }, []);

  const handleSelectFolder = async () => {
    const path = await window.electronAPI.dialog.selectDirectory();
    if (path) {
      onSelectProject(path);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md px-6">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold">Open a project</h2>
          <p className="text-muted-foreground">
            Choose a git repository to start. VibeTree gives every task its own worktree with a
            persistent terminal, so you can run Claude Code, Codex, Aider, or any CLI in parallel.
          </p>
        </div>
        <Button size="lg" onClick={handleSelectFolder} className="gap-2">
          <FolderOpen className="h-5 w-5" />
          Open Project Folder
        </Button>

        {recentProjects.length > 0 && (
          <div className="space-y-2 text-left">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center">
              Recent projects
            </p>
            <div className="space-y-1">
              {recentProjects.slice(0, 5).map((project) => (
                <button
                  key={project.path}
                  onClick={() => onSelectProject(project.path)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md border hover:bg-accent transition-colors text-left"
                >
                  <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">{project.name}</span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {project.path}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
