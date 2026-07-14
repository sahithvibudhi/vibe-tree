import { useEffect, useState } from 'react';
import { useAuth, LoginPage } from '@vibetree/auth';
import { WorktreePanel } from './components/WorktreePanel';
import { TerminalManager } from './components/TerminalManager';
import { GitDiffView } from './components/GitDiffView';
import { ConnectionStatus } from './components/ConnectionStatus';
import { ProjectSelector } from './components/ProjectSelector';
import { OnboardingHint } from './components/OnboardingHint';
import { Toaster } from './components/Toaster';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@vibetree/ui';
import { useAppStore } from './store';
import { useWebSocket } from './hooks/useWebSocket';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { Sun, Moon, Plus, X, Keyboard, Volume2, VolumeX } from 'lucide-react';
import { autoLoadProjects } from './services/projectValidation';
import { isSoundEnabled, setSoundEnabled } from './services/sound';

function App() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    projects,
    activeProjectId,
    addProject,
    addProjects,
    removeProject,
    setActiveProject,
    setSelectedTab,
    theme,
    setTheme,
    connected,
    addToast
  } = useAppStore();
  const { connect } = useWebSocket();
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [autoLoadAttempted, setAutoLoadAttempted] = useState(false);
  const [hasConnectedOnce, setHasConnectedOnce] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());

  useKeyboardShortcuts(() => setShowShortcuts(true));

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  };

  useEffect(() => {
    if (connected) {
      setHasConnectedOnce(true);
    }
  }, [connected]);

  // const activeProject = getActiveProject();

  useEffect(() => {
    // Auto-connect on mount
    connect();
  }, []);

  // Auto-load projects when connection is established
  useEffect(() => {
    if (connected && !autoLoadAttempted && projects.length === 0) {
      const loadProjects = async () => {
        try {
          // Get auto-load configuration from backend
          const autoLoadResponse = await autoLoadProjects();

          if (autoLoadResponse.validationResults.length > 0) {
            const validPaths = autoLoadResponse.validationResults
              .filter((result) => result.valid)
              .map((result) => result.path);

            if (validPaths.length > 0) {
              // Add valid projects
              const addedIds = addProjects(validPaths);

              // Set default project if specified by backend
              if (autoLoadResponse.defaultProjectPath) {
                const defaultIndex = validPaths.indexOf(autoLoadResponse.defaultProjectPath);
                if (defaultIndex >= 0) {
                  const defaultId = addedIds[defaultIndex];
                  setActiveProject(defaultId);
                }
              }

              addToast(
                `Auto-loaded ${validPaths.length} project${validPaths.length === 1 ? '' : 's'}`,
                'success'
              );
            }

            // Invalid configured paths are a setup problem the user can fix
            const invalidResults = autoLoadResponse.validationResults.filter(
              (result) => !result.valid
            );
            for (const result of invalidResults) {
              addToast(`Could not load ${result.path}: ${result.error ?? 'not a git repository'}`, 'error');
            }
          }
        } catch (error) {
          console.error('Auto-load failed:', error);
        }

        setAutoLoadAttempted(true);
      };

      loadProjects();
    }
  }, [connected, autoLoadAttempted, projects.length, addProjects, setActiveProject]);

  useEffect(() => {
    // Initialize theme from localStorage or system preference
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      setTheme(systemTheme);
    }
  }, [setTheme]);

  useEffect(() => {
    // Apply theme class to document
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const handleSelectProject = (path: string) => {
    addProject(path);
    setShowProjectSelector(false);
  };

  const handleSelectProjects = (paths: string[]) => {
    const ids = addProjects(paths);
    if (ids.length > 0) setActiveProject(ids[0]);
    setShowProjectSelector(false);
  };

  const handleCloseProject = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    removeProject(projectId);
  };

  // Show login page if not authenticated and not loading
  if (!authLoading && !isAuthenticated) {
    return <LoginPage />;
  }

  // The PWA shell loads offline, but nothing works without the server:
  // make that state obvious instead of showing a dead UI
  if (!connected && hasConnectedOnce) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-sm px-6">
          <h2 className="text-lg font-semibold mb-2">Server unreachable</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Lost connection to the VibeTree server. Your terminal sessions keep running on the
            server and will be restored when the connection returns.
          </p>
          <button
            onClick={() => connect()}
            className="px-4 py-2 text-sm rounded-md border hover:bg-accent transition-colors"
          >
            Reconnect
          </button>
        </div>
      </div>
    );
  }

  // Show project selector if no projects exist or explicitly requested
  if (projects.length === 0 || showProjectSelector) {
    return (
      <div className="h-screen flex flex-col bg-background">
        <Toaster />
        <ShortcutsHelp open={showShortcuts} onClose={() => setShowShortcuts(false)} />
        {/* Header */}
        <header className="h-12 border-b flex items-center justify-between px-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold tracking-tight">VibeTree</h1>
          </div>
          <div className="flex items-center gap-1">
            <ConnectionStatus />
            <button
              onClick={() => setShowShortcuts(true)}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts"
            >
              <Keyboard className="h-4 w-4" />
            </button>
            <button
              onClick={toggleTheme}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <OnboardingHint />

        {/* Project Selector */}
        <ProjectSelector
          onSelectProject={handleSelectProject}
          onSelectProjects={handleSelectProjects}
        />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <Toaster />
      <ShortcutsHelp open={showShortcuts} onClose={() => setShowShortcuts(false)} />

      {/* Header */}
      <header className="h-12 border-b flex items-center justify-between px-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold tracking-tight">VibeTree</h1>
        </div>
        <div className="flex items-center gap-1">
          <ConnectionStatus />
          <button
            onClick={toggleSound}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            aria-label={soundOn ? 'Mute agent notifications' : 'Unmute agent notifications'}
            title={soundOn ? 'Agent sound on' : 'Agent sound off'}
          >
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setShowShortcuts(true)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts"
          >
            <Keyboard className="h-4 w-4" />
          </button>
          <button
            onClick={toggleTheme}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <OnboardingHint />

      {/* Project Tabs and Content */}
      <Tabs
        value={activeProjectId || ''}
        onValueChange={setActiveProject}
        className="flex-1 flex flex-col"
      >
        <div className="border-b flex items-center gap-1 h-9 px-2">
          <TabsList className="h-full bg-transparent p-0 rounded-none gap-1">
            {projects.map((project) => (
              <TabsTrigger
                key={project.id}
                value={project.id}
                className="relative my-1 h-7 rounded-md px-2.5 pr-7 text-xs font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:border data-[state=active]:shadow-sm"
              >
                {project.name}
                <span
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-4 w-4 p-0.5 hover:bg-muted rounded cursor-pointer inline-flex items-center justify-center"
                  onClick={(e) => handleCloseProject(e, project.id)}
                >
                  <X className="h-3 w-3" />
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          <button
            onClick={() => setShowProjectSelector(true)}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors inline-flex items-center justify-center"
            aria-label="Add project"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {projects.map((project) => (
          <TabsContent key={project.id} value={project.id} className="flex-1 m-0 h-0">
            <div className="flex h-full overflow-hidden">
              {/* Worktree Panel - Always visible on desktop, conditional on mobile */}
              <div
                className={`
                ${project.selectedWorktree ? 'hidden md:flex' : 'flex'} 
                w-full md:w-80 border-r flex-shrink-0
              `}
              >
                <WorktreePanel projectId={project.id} />
              </div>

              {/* Main content; the Terminal/Changes switch lives in each view's toolbar */}
              {project.selectedWorktree ? (
                <div className="flex-1 overflow-hidden relative">
                  <div
                    className={`absolute inset-0 ${project.selectedTab === 'terminal' ? 'block' : 'hidden'}`}
                  >
                    <TerminalManager
                      worktrees={project.worktrees || []}
                      selectedWorktree={project.selectedWorktree}
                      viewTab={project.selectedTab === 'changes' ? 'changes' : 'terminal'}
                      onViewTabChange={(tab) => setSelectedTab(project.id, tab)}
                    />
                  </div>

                  {/* Keep GitDiffView mounted but hidden to preserve state */}
                  <div
                    className={`absolute inset-0 ${project.selectedTab === 'changes' ? 'block' : 'hidden'}`}
                  >
                    <GitDiffView
                      worktreePath={project.selectedWorktree}
                      theme={theme}
                      viewTab={project.selectedTab === 'changes' ? 'changes' : 'terminal'}
                      onViewTabChange={(tab) => setSelectedTab(project.id, tab)}
                    />
                  </div>
                </div>
              ) : (
                /* Empty state when no worktree selected */
                <div className="hidden md:flex flex-1 items-center justify-center">
                  <div className="text-center max-w-xs">
                    <p className="text-sm font-medium mb-1">Pick a worktree to open its terminal</p>
                    <p className="text-xs text-muted-foreground">
                      Each worktree is an isolated checkout with its own branch and session. Create
                      one per task or agent with the + button.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export default App;
