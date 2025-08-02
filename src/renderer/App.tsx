import { useEffect, useState } from 'react';
import { AppHeader } from './components/AppHeader';
import { ProjectSelector } from './components/ProjectSelector';
import { ProjectWorkspace } from './components/ProjectWorkspace';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { Button } from './components/ui/button';
import { Toaster } from './components/ui/toaster';
import { useToast } from './components/ui/use-toast';
import { ProjectProvider, useProjects } from './contexts/ProjectContext';
import { Plus, X, Bell } from 'lucide-react';

function AppContent() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [notifications, setNotifications] = useState<Map<string, boolean>>(new Map());
  const { projects, activeProjectId, addProject, removeProject, setActiveProject } = useProjects();
  const { toast } = useToast();

  useEffect(() => {
    // Get initial theme from localStorage or system
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else {
      window.electronAPI.theme.get().then(setTheme);
    }

    // Listen for system theme changes
    window.electronAPI.theme.onChange((newTheme) => {
      if (!localStorage.getItem('theme')) {
        setTheme(newTheme);
      }
    });
  }, []);

  useEffect(() => {
    // Apply theme class to document
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    // Listen for notifications
    const unsubscribeNotification = window.electronAPI.notifications.onNotification((notification) => {
      // Show toast notification
      toast({
        title: notification.type === 'claude-needs-input' ? 'Claude needs your input' : 'Claude finished',
        description: `${notification.projectName}: ${notification.message || ''}`,
      });

      // Mark project as having notification
      setNotifications(prev => {
        const newMap = new Map(prev);
        newMap.set(notification.worktree, true);
        return newMap;
      });
    });

    // Listen for focus worktree events
    const unsubscribeFocus = window.electronAPI.notifications.onFocusWorktree((worktreePath) => {
      // Find project containing this worktree and switch to it
      for (const project of projects) {
        const hasWorktree = project.worktrees?.some(w => w.path === worktreePath);
        if (hasWorktree || project.path === worktreePath) {
          setActiveProject(project.id);
          // Also select the specific worktree
          const projectWorkspace = document.querySelector(`[data-project-id="${project.id}"]`);
          if (projectWorkspace) {
            // Trigger worktree selection through a custom event
            const event = new CustomEvent('select-worktree', { detail: { worktreePath } });
            projectWorkspace.dispatchEvent(event);
          }
          break;
        }
      }
    });

    return () => {
      unsubscribeNotification?.();
      unsubscribeFocus?.();
    };
  }, [projects, setActiveProject, toast]);

  const handleSelectProject = (path: string) => {
    addProject(path);
    setShowProjectSelector(false);
  };

  const handleCloseProject = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    removeProject(projectId);
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <AppHeader theme={theme} onThemeToggle={toggleTheme} />

      {projects.length === 0 || showProjectSelector ? (
        <ProjectSelector onSelectProject={handleSelectProject} />
      ) : (
        <Tabs 
          value={activeProjectId || ''} 
          onValueChange={setActiveProject}
          className="flex-1 flex flex-col"
        >
          <div className="border-b flex items-center gap-2 bg-muted/50 h-10">
            <TabsList className="h-full bg-transparent p-0 rounded-none">
              {projects.map((project) => (
                <TabsTrigger
                  key={project.id}
                  value={project.id}
                  className="relative pr-8 h-full data-[state=active]:bg-background data-[state=active]:rounded-t-md data-[state=active]:border-t data-[state=active]:border-x data-[state=active]:border-b-0"
                  onClick={() => {
                    // Clear notification when tab is clicked
                    setNotifications(prev => {
                      const newMap = new Map(prev);
                      newMap.delete(project.path);
                      return newMap;
                    });
                  }}
                >
                  <span className="flex items-center gap-2">
                    {project.name}
                    {notifications.get(project.path) && (
                      <Bell className="h-3 w-3 text-yellow-500 animate-pulse" />
                    )}
                  </span>
                  <span
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 p-0.5 hover:bg-muted rounded cursor-pointer inline-flex items-center justify-center"
                    onClick={(e) => handleCloseProject(e, project.id)}
                  >
                    <X className="h-3 w-3" />
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowProjectSelector(true)}
              className="h-8 w-8"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {projects.map((project) => (
            <TabsContent 
              key={project.id} 
              value={project.id}
              className="flex-1 m-0 h-full"
            >
              <ProjectWorkspace projectId={project.id} theme={theme} />
            </TabsContent>
          ))}
        </Tabs>
      )}

      <Toaster />
    </div>
  );
}

function App() {
  return (
    <ProjectProvider>
      <AppContent />
    </ProjectProvider>
  );
}

export default App;