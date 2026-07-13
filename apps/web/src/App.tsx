import { useEffect, useState } from 'react';
import { useAuth, LoginPage } from '@vibetree/auth';
import { WorktreePanel } from './components/WorktreePanel';
import { TerminalManager } from './components/TerminalManager';
import { GitDiffView } from './components/GitDiffView';
import { ConnectionStatus } from './components/ConnectionStatus';
import { ProjectSelector } from './components/ProjectSelector';
import { OnboardingHint } from './components/OnboardingHint';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@vibetree/ui';
import { useAppStore } from './store';
import { useWebSocket } from './hooks/useWebSocket';
import { Sun, Moon, Plus, X, Terminal, GitBranch, CheckCircle } from 'lucide-react';
import { autoLoadProjects } from './services/projectValidation';

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
    connected
  } = useAppStore();
  const { connect } = useWebSocket();
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [autoLoadAttempted, setAutoLoadAttempted] = useState(false);
  const [showSuccessNotification, setShowSuccessNotification] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [hasConnectedOnce, setHasConnectedOnce] = useState(false);

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

              console.log(`Auto-loaded ${validPaths.length} projects`);

              // Show success notification
              setSuccessMessage(
                `Successfully auto-loaded ${validPaths.length} project${validPaths.length === 1 ? '' : 's'}`
              );
              setShowSuccessNotification(true);

              // Auto-hide notification after 3 seconds
              setTimeout(() => {
                setShowSuccessNotification(false);
              }, 3000);
            }

            // Log validation errors for invalid paths
            const invalidResults = autoLoadResponse.validationResults.filter(
              (result) => !result.valid
            );
            if (invalidResults.length > 0) {
              console.warn('Some projects failed validation:', invalidResults);
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
        {/* Header */}
        <header className="h-14 border-b flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">VibeTree</h1>
            <span className="text-xs text-muted-foreground hidden sm:inline">Web Terminal</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 hover:bg-accent rounded-md transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <ConnectionStatus />
          </div>
        </header>

        <OnboardingHint />

        {/* Project Selector */}
        <ProjectSelector onSelectProject={handleSelectProject} />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Success Notification Banner */}
      {showSuccessNotification && (
        <div className="bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 px-4 py-2">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm font-medium">{successMessage}</span>
            <button
              onClick={() => setShowSuccessNotification(false)}
              className="ml-auto hover:bg-green-100 dark:hover:bg-green-800/30 rounded p-1"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="h-14 border-b flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">VibeTree</h1>
          <span className="text-xs text-muted-foreground hidden sm:inline">Web Terminal</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="p-2 hover:bg-accent rounded-md transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <ConnectionStatus />
        </div>
      </header>

      <OnboardingHint />

      {/* Project Tabs and Content */}
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
          <button
            onClick={() => setShowProjectSelector(true)}
            className="h-8 w-8 p-0 hover:bg-accent rounded transition-colors inline-flex items-center justify-center"
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

              {/* Main Content Area with Tabs - Only shown when worktree is selected */}
              {project.selectedWorktree ? (
                <div className="flex-1 flex flex-col h-full">
                  {/* Tab Navigation */}
                  <div className="h-10 border-b flex items-center px-2 bg-muted/30 flex-shrink-0">
                    <div className="flex">
                      <button
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1.5 ${
                          project.selectedTab === 'terminal'
                            ? 'bg-background text-foreground border shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        }`}
                        onClick={() => setSelectedTab(project.id, 'terminal')}
                      >
                        <Terminal className="h-3.5 w-3.5" />
                        Terminal
                      </button>
                      <button
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1.5 ml-1 ${
                          project.selectedTab === 'changes'
                            ? 'bg-background text-foreground border shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        }`}
                        onClick={() => setSelectedTab(project.id, 'changes')}
                      >
                        <GitBranch className="h-3.5 w-3.5" />
                        Changes
                      </button>
                    </div>
                  </div>

                  {/* Tab Content */}
                  <div className="flex-1 overflow-hidden relative">
                    {/* Terminal Tab - Managed terminals with lifecycle control */}
                    <div
                      className={`absolute inset-0 ${project.selectedTab === 'terminal' ? 'block' : 'hidden'}`}
                    >
                      <TerminalManager
                        worktrees={project.worktrees || []}
                        selectedWorktree={project.selectedWorktree}
                      />
                    </div>

                    {/* Keep GitDiffView mounted but hidden to preserve state */}
                    <div
                      className={`absolute inset-0 ${project.selectedTab === 'changes' ? 'block' : 'hidden'}`}
                    >
                      <GitDiffView worktreePath={project.selectedWorktree} theme={theme} />
                    </div>
                  </div>
                </div>
              ) : (
                /* Empty state when no worktree selected */
                <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <p className="text-lg mb-2">Select a worktree to start</p>
                    <p className="text-sm">Choose from the panel on the left</p>
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
