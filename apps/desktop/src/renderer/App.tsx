import { useEffect, useRef, useState } from 'react';
import { TitleBar } from './components/TitleBar';
import { ProjectSelector } from './components/ProjectSelector';
import { ProjectWorkspace } from './components/ProjectWorkspace';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { Button } from './components/ui/button';
import { Toaster } from './components/ui/toaster';
import { ProjectProvider, useProjects } from './contexts/ProjectContext';
import { Plus, X } from 'lucide-react';
import { GlobalTerminalSettings } from './components/GlobalTerminalSettings';
import { GlobalSettings } from './components/GlobalSettings';
import { OnboardingDialog } from './components/OnboardingDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './components/ui/dialog';

function AppContent() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [projectToClose, setProjectToClose] = useState<{ id: string; name: string } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const {
    projects,
    activeProjectId,
    addProject,
    removeProject,
    setActiveProject,
    setSelectedWorktree
  } = useProjects();

  // Menu accelerators land here; dialog and tab state live deeper in the
  // tree, so they are re-broadcast as DOM events the owning component hears
  const menuStateRef = useRef({ projects, activeProjectId, setSelectedWorktree });
  menuStateRef.current = { projects, activeProjectId, setSelectedWorktree };

  useEffect(() => {
    const menu = window.electronAPI.menu;
    const unsubscribes = [
      menu.onNewWorktree?.(() => {
        window.dispatchEvent(new CustomEvent('vibetree:new-worktree'));
      }),
      menu.onToggleView?.(() => {
        window.dispatchEvent(new CustomEvent('vibetree:toggle-view'));
      }),
      menu.onToggleSidebar?.(() => {
        setSidebarCollapsed((collapsed) => !collapsed);
      }),
      menu.onSelectWorktreeDelta?.((delta) => {
        const { projects, activeProjectId, setSelectedWorktree } = menuStateRef.current;
        const project = projects.find((p) => p.id === activeProjectId);
        if (!project || project.worktrees.length === 0) return;
        const paths = project.worktrees.map((w) => w.path);
        const currentIndex = project.selectedWorktree
          ? paths.indexOf(project.selectedWorktree)
          : -1;
        const nextIndex = (currentIndex + delta + paths.length) % paths.length;
        setSelectedWorktree(project.id, paths[nextIndex]);
      })
    ];
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe?.());
  }, []);

  useEffect(() => {
    window.electronAPI.appSettings
      .get()
      .then((settings) => {
        if (!settings.hasSeenOnboarding) {
          setShowOnboarding(true);
        }
      })
      .catch(() => {
        // Settings unavailable (e.g. in tests): skip onboarding
      });
  }, []);

  const completeOnboarding = () => {
    setShowOnboarding(false);
    window.electronAPI.appSettings.update({ hasSeenOnboarding: true }).catch(() => {});
  };

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
      console.log('Debug layout mode enabled - Component borders visible');
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
    const project = projects.find((p) => p.id === projectId);
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
      {projects.length === 0 ? (
        <>
          <TitleBar theme={theme} onThemeToggle={toggleTheme} />
          <ProjectSelector onSelectProject={handleSelectProject} />
        </>
      ) : (
        <Tabs
          value={activeProjectId || ''}
          onValueChange={setActiveProject}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TitleBar
            theme={theme}
            onThemeToggle={toggleTheme}
            onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            <TabsList className="h-full bg-transparent p-0 rounded-none gap-1">
              {projects.map((project) => (
                <TabsTrigger
                  key={project.id}
                  value={project.id}
                  className="group relative h-6 rounded-md px-2.5 pr-6 text-xs font-medium text-muted-foreground hover:text-foreground data-[state=active]:bg-accent data-[state=active]:text-foreground"
                >
                  {project.name}
                  <span
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-4 w-4 p-0.5 rounded cursor-pointer inline-flex items-center justify-center opacity-0 group-hover:opacity-100 group-data-[state=active]:opacity-60 hover:!opacity-100 hover:bg-muted transition-opacity"
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
              className="h-6 w-6 text-muted-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </TitleBar>

          {projects.map((project) => (
            <TabsContent
              key={project.id}
              value={project.id}
              className="flex-1 m-0 h-0 overflow-hidden"
            >
              <ProjectWorkspace
                projectId={project.id}
                theme={theme}
                sidebarCollapsed={sidebarCollapsed}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}

      <Toaster />
      <GlobalTerminalSettings />
      <GlobalSettings />

      <OnboardingDialog
        open={showOnboarding}
        onComplete={completeOnboarding}
        onOpenProject={handleOpenProjectDialog}
      />

      <Dialog open={projectToClose !== null} onOpenChange={(open) => !open && cancelCloseProject()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Project?</DialogTitle>
            <DialogDescription>
              Are you sure you want to close &quot;{projectToClose?.name}&quot;? All terminal
              sessions for this project will be terminated.
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
