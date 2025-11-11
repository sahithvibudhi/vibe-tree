import { WorktreePanel } from './WorktreePanel';
import { RightPaneView } from './RightPaneView';
import { useProjects } from '../contexts/ProjectContext';

interface ProjectWorkspaceProps {
  projectId: string;
  theme?: 'light' | 'dark';
}

export function ProjectWorkspace({ projectId, theme }: ProjectWorkspaceProps) {
  const { getProject, setSelectedWorktree, updateProjectWorktrees, setWorktreeSchedulerStatus } = useProjects();
  const project = getProject(projectId);

  if (!project) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">Project not found</div>;
  }

  return (
    <div className="flex h-full overflow-hidden">
      <WorktreePanel
        projectPath={project.path}
        selectedWorktree={project.selectedWorktree}
        onSelectWorktree={(worktree) => setSelectedWorktree(projectId, worktree)}
        onWorktreesChange={(worktrees) => updateProjectWorktrees(projectId, worktrees)}
        initialWorktrees={project.worktrees}
        projectId={projectId}
      />
      {project.selectedWorktree && (
        <RightPaneView
          worktreePath={project.selectedWorktree}
          projectId={projectId}
          theme={theme}
          onSchedulerStatusChange={(hasRunningScheduler) =>
            setWorktreeSchedulerStatus(projectId, project.selectedWorktree!, hasRunningScheduler)
          }
        />
      )}
    </div>
  );
}