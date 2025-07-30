import { useEffect, useRef } from 'react';
import { WorktreePanel } from './WorktreePanel';
import { ClaudeTerminal } from './ClaudeTerminal';
import { useProjects } from '../contexts/ProjectContext';

interface ProjectWorkspaceProps {
  projectId: string;
}

export function ProjectWorkspace({ projectId }: ProjectWorkspaceProps) {
  const { getProject, setSelectedWorktree, updateProjectWorktrees } = useProjects();
  const project = getProject(projectId);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleSelectWorktree = (event: Event) => {
      const customEvent = event as CustomEvent;
      const worktreePath = customEvent.detail.worktreePath;
      if (worktreePath) {
        setSelectedWorktree(projectId, worktreePath);
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('select-worktree', handleSelectWorktree);
      return () => {
        container.removeEventListener('select-worktree', handleSelectWorktree);
      };
    }
  }, [projectId, setSelectedWorktree]);

  if (!project) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">Project not found</div>;
  }

  return (
    <div className="flex-1 flex h-full" ref={containerRef} data-project-id={projectId}>
      <WorktreePanel
        projectPath={project.path}
        selectedWorktree={project.selectedWorktree}
        onSelectWorktree={(worktree) => setSelectedWorktree(projectId, worktree)}
        onWorktreesChange={(worktrees) => updateProjectWorktrees(projectId, worktrees)}
      />
      {project.selectedWorktree && (
        <ClaudeTerminal 
          worktreePath={project.selectedWorktree} 
          projectId={projectId}
        />
      )}
    </div>
  );
}