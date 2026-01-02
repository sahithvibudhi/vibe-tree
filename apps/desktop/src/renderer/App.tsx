import { useEffect, useState } from 'react';
import { AppHeader } from './components/AppHeader';
import { ProjectSelector } from './components/ProjectSelector';
import { ProjectWorkspace } from './components/ProjectWorkspace';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { Button } from './components/ui/button';
import { Toaster } from './components/ui/toaster';
import { ProjectProvider, useProjects } from './contexts/ProjectContext';
import { Plus, X } from 'lucide-react';
import { GlobalTerminalSettings } from './components/GlobalTerminalSettings';
import { GlobalSettings } from './components/GlobalSettings';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './components/ui/dialog';

function AppContent() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [projectToClose, setProjectToClose] = useState<{ id: string; name: string } | null>(null);
  const { projects, activeProjectId, addProject, removeProject, setActiveProject } = useProjects();

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

    // Load debug CSS if DEBUG_LAYOUT environment variable is set
    if (process.env.DEBUG_LAYOUT === 'true') {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = './styles/debug-layout.css';
      document.head.appendChild(link);
      console.log('🎨 Debug layout mode enabled - Component borders visible');
    }
  }, []);

  useEffect(() => {
    // Apply theme class to document
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const handleSelectProject = (path: string) => {
    addProject(path);
  };

  const handleOpenProjectDialog = async () => {
    const path = await window.electronAPI.dialog.selectDirectory();
    if (path) {
      addProject(path);
    }
  };

  const handleCloseProject = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    const project = projects.find(p => p.id === projectId);
    if (project) {
      setProjectToClose({ id: project.id, name: project.name });
    }
  };

  const confirmCloseProject = () => {
    if (projectToClose) {
      removeProject(projectToClose.id);
      setProjectToClose(null);
    }
  };

  const cancelCloseProject = () => {
    setProjectToClose(null);
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <AppHeader theme={theme} onThemeToggle={toggleTheme} />

      {projects.length === 0 ? (
        <ProjectSelector onSelectProject={handleSelectProject} />
      ) : (
        <Tabs
          value={activeProjectId || ''}
          onValueChange={setActiveProject}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="border-b flex items-center gap-2 bg-muted/50 h-10">
            <TabsList className="h-full bg-transparent p-0 rounded-none">
              {projects.map((project) => (
                <TabsTrigger
                  key={project.id}
                  value={project.id}
                  className="relative pr-8 h-full data-[state=active]:bg-background data-[state=active]:rounded-t-md data-[state=active]:border-t data-[state=active]:border-x data-[state=active]:border-b-0"
                >
                  {project.name}
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
              onClick={handleOpenProjectDialog}
              className="h-8 w-8"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {projects.map((project) => (
            <TabsContent
              key={project.id}
              value={project.id}
              className="flex-1 m-0 h-0 overflow-hidden"
            >
              <ProjectWorkspace projectId={project.id} theme={theme} />
            </TabsContent>
          ))}
        </Tabs>
      )}

      <Toaster />
      <GlobalTerminalSettings />
      <GlobalSettings />

      <Dialog open={projectToClose !== null} onOpenChange={(open) => !open && cancelCloseProject()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Project?</DialogTitle>
            <DialogDescription>
              Are you sure you want to close &quot;{projectToClose?.name}&quot;? All terminal sessions for this project will be terminated.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelCloseProject}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmCloseProject}>
              Close Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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