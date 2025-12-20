import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';

interface Worktree {
  path: string;
  branch: string;
  head: string;
}

interface Project {
  id: string;
  path: string;
  name: string;
  worktrees: Worktree[];
  selectedWorktree: string | null;
}

interface ProjectContextType {
  projects: Project[];
  activeProjectId: string | null;
  addProject: (path: string) => string;
  removeProject: (id: string) => void;
  setActiveProject: (id: string) => void;
  updateProjectWorktrees: (id: string, worktrees: Worktree[]) => void;
  setSelectedWorktree: (projectId: string, worktreePath: string | null) => void;
  getProject: (id: string) => Project | undefined;
  getActiveProject: () => Project | undefined;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

export function useProjects() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjects must be used within ProjectProvider');
  }
  return context;
}

interface ProjectProviderProps {
  children: ReactNode;
}

export function ProjectProvider({ children }: ProjectProviderProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const addProject = useCallback((path: string): string => {
    // Check if project already exists
    const existing = projects.find(p => p.path === path);
    if (existing) {
      setActiveProjectId(existing.id);
      // Update recent projects when reopening existing project
      window.electronAPI.recentProjects.add(path);
      return existing.id;
    }

    const id = `project-${Date.now()}`;
    const name = path.split('/').pop() || 'Unnamed Project';

    const newProject: Project = {
      id,
      path,
      name,
      worktrees: [],
      selectedWorktree: null
    };

    setProjects(prev => [...prev, newProject]);
    setActiveProjectId(id);

    // Add to recent projects when opening new project
    window.electronAPI.recentProjects.add(path);

    return id;
  }, [projects]);

  useEffect(() => {
    // Listen for menu-triggered project opening
    const unsubscribeOpen = window.electronAPI.recentProjects.onOpenProject((path: string) => {
      addProject(path);
    });

    const unsubscribeOpenRecent = window.electronAPI.recentProjects.onOpenRecentProject((path: string) => {
      addProject(path);
    });

    return () => {
      unsubscribeOpen();
      unsubscribeOpenRecent();
    };
  }, [addProject]);

  // Handle notification click - switch to correct project and worktree
  useEffect(() => {
    const unsubscribe = window.electronAPI.claudeNotification.onClicked((_processId: string, worktreePath: string) => {
      // Find the project containing this worktree
      const project = projects.find(p =>
        p.worktrees.some(w => w.path === worktreePath) || p.path === worktreePath
      );

      if (project) {
        // Switch to the project
        setActiveProjectId(project.id);
        // Switch to the worktree
        setProjects(prev => prev.map(p =>
          p.id === project.id ? { ...p, selectedWorktree: worktreePath } : p
        ));
      }
    });

    return unsubscribe;
  }, [projects]);

  const removeProject = (id: string) => {
    // Find the project being removed
    const project = projects.find(p => p.id === id);

    if (project) {
      // Terminate all PTY sessions for each worktree in this project
      const worktreePaths = project.worktrees.map(w => w.path);

      // Also include the main project path in case terminals were started there
      const pathsToTerminate = [project.path, ...worktreePaths];

      console.log(`Terminating PTY sessions for ${pathsToTerminate.length} paths:`, pathsToTerminate);

      // Terminate sessions for each path
      Promise.all(pathsToTerminate.map(path =>
        window.electronAPI.shell.terminateForWorktree(path)
      )).then((results) => {
        const totalTerminated = results.reduce((sum, r) => sum + r.count, 0);
        console.log(`Terminated ${totalTerminated} PTY session(s) total for project: ${project.name}`);
      }).catch((error) => {
        console.error('Error terminating PTY sessions:', error);
      });
    }

    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProjectId === id) {
      const remaining = projects.filter(p => p.id !== id);
      setActiveProjectId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const setActiveProject = (id: string) => {
    setActiveProjectId(id);
  };

  const updateProjectWorktrees = (id: string, worktrees: Worktree[]) => {
    setProjects(prev => prev.map(p => 
      p.id === id ? { ...p, worktrees } : p
    ));
  };

  const setSelectedWorktree = (projectId: string, worktreePath: string | null) => {
    setProjects(prev => prev.map(p => 
      p.id === projectId ? { ...p, selectedWorktree: worktreePath } : p
    ));
  };

  const getProject = (id: string): Project | undefined => {
    return projects.find(p => p.id === id);
  };

  const getActiveProject = (): Project | undefined => {
    return activeProjectId ? projects.find(p => p.id === activeProjectId) : undefined;
  };

  const value: ProjectContextType = {
    projects,
    activeProjectId,
    addProject,
    removeProject,
    setActiveProject,
    updateProjectWorktrees,
    setSelectedWorktree,
    getProject,
    getActiveProject
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}