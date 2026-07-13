import { Button } from './ui/button';
import { FolderOpen } from 'lucide-react';

interface ProjectSelectorProps {
  onSelectProject: (path: string) => void;
}

export function ProjectSelector({ onSelectProject }: ProjectSelectorProps) {
  const handleSelectFolder = async () => {
    const path = await window.electronAPI.dialog.selectDirectory();
    if (path) {
      onSelectProject(path);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-6">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold">Select a Project</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Choose a git repository to start collaborating with Claude in parallel worktrees
          </p>
        </div>
        <Button size="lg" onClick={handleSelectFolder} className="gap-2">
          <FolderOpen className="h-5 w-5" />
          Open Project Folder
        </Button>
      </div>
    </div>
  );
}
