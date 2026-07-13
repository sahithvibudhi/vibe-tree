import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@vibetree/ui';
import { useAppStore } from '../store';
import { useWebSocket } from '../hooks/useWebSocket';
import { ChevronLeft, Maximize2, Minimize2, Columns2, X } from 'lucide-react';
import type { Terminal as XTerm } from '@xterm/xterm';

// Cache for terminal states per session ID (like desktop app)
const terminalStateCache = new Map<string, string>();

interface TerminalViewProps {
  worktreePath: string;
}

export function TerminalView({ worktreePath }: TerminalViewProps) {
  const {
    getActiveProject,
    setSelectedWorktree,
    terminalSessions,
    addTerminalSession,
    removeTerminalSession,
    theme
  } = useAppStore();

  const activeProject = getActiveProject();
  const selectedWorktree = worktreePath;
  const { getAdapter } = useWebSocket();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [splitSessionId, setSplitSessionId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSplit, setIsSplit] = useState(false);
  const terminalRef = useRef<XTerm | null>(null);
  const splitTerminalRef = useRef<XTerm | null>(null);
  const cleanupRef = useRef<(() => void)[]>([]);
  const splitCleanupRef = useRef<(() => void)[]>([]);
  const saveIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const splitSaveIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!selectedWorktree) {
      return;
    }

    const adapter = getAdapter();
    if (!adapter) {
      return;
    }

    // Check if we already have a session for this worktree
    const existingSessionId = terminalSessions.get(selectedWorktree);
    if (existingSessionId) {
      // Set up event listeners for existing session
      const unsubscribeOutput = adapter.onShellOutput(existingSessionId, (data) => {
        if (terminalRef.current) {
          terminalRef.current.write(data);
        }
      });

      const unsubscribeExit = adapter.onShellExit(existingSessionId, (code) => {
        if (terminalRef.current) {
          terminalRef.current.write(`\r\n[Process exited with code ${code}]\r\n`);
        }
        // Clear cached state when session exits
        terminalStateCache.delete(existingSessionId);
        removeTerminalSession(selectedWorktree);
        setSessionId(null);
      });

      cleanupRef.current = [unsubscribeOutput, unsubscribeExit];
      setSessionId(existingSessionId);

      // Restore terminal state for existing session (like desktop app)
      console.log('🔄 Reconnecting to existing session - restoring state');
      console.log('📊 Session cache status:', {
        sessionId: existingSessionId,
        hasCachedState: terminalStateCache.has(existingSessionId),
        cacheSize: terminalStateCache.size,
        allCachedSessions: Array.from(terminalStateCache.keys())
      });

      const cachedState = terminalStateCache.get(existingSessionId);
      if (cachedState && terminalRef.current) {
        setTimeout(() => {
          if (terminalRef.current && cachedState) {
            terminalRef.current.clear();
            terminalRef.current.write(cachedState);
            console.log('✅ State restored for existing session:', existingSessionId);
          }
        }, 100);
      } else {
        console.log('⚠️ No cached state for existing session:', existingSessionId);
      }

      return;
    }

    // Start new shell session - follow desktop app pattern
    const startSession = async () => {
      try {
        // Call server directly and wait for actual session ID (like desktop app)
        const result = await adapter.startShell(selectedWorktree);

        if (result.success && result.processId) {
          // Use the actual session ID returned by server
          const actualSessionId = result.processId;

          // Set up event listeners using the server-provided session ID
          const unsubscribeOutput = adapter.onShellOutput(actualSessionId, (data) => {
            if (terminalRef.current) {
              terminalRef.current.write(data);
            }
          });

          const unsubscribeExit = adapter.onShellExit(actualSessionId, (code) => {
            if (terminalRef.current) {
              terminalRef.current.write(`\r\n[Process exited with code ${code}]\r\n`);
            }
            // Clear cached state when session exits
            terminalStateCache.delete(actualSessionId);
            removeTerminalSession(selectedWorktree);
            setSessionId(null);
          });

          cleanupRef.current = [unsubscribeOutput, unsubscribeExit];
          // Check if this is a different session ID than what we had cached
          const cachedSessionId = terminalSessions.get(selectedWorktree);
          if (cachedSessionId && cachedSessionId !== actualSessionId) {
            console.warn(`🔄 Session ID changed for ${selectedWorktree}:`, {
              oldSessionId: cachedSessionId,
              newSessionId: actualSessionId,
              reason: 'Likely session timeout and cleanup'
            });
            // Clear old cached state since session changed
            terminalStateCache.delete(cachedSessionId);
          }

          setSessionId(actualSessionId);
          addTerminalSession(selectedWorktree, actualSessionId);

          console.log(
            `Shell started: ${actualSessionId}, isNew: ${result.isNew}, worktree: ${selectedWorktree}`
          );
          console.log('📊 Terminal cache status:', {
            sessionId: actualSessionId,
            hasCachedState: terminalStateCache.has(actualSessionId),
            cacheSize: terminalStateCache.size,
            allCachedSessions: Array.from(terminalStateCache.keys())
          });

          if (!result.isNew) {
            // Prefer the local serialized snapshot; fall back to the
            // server-side scrollback buffer, which survives page reloads.
            // The xterm instance mounts asynchronously after setSessionId,
            // so retry until it is ready instead of silently skipping.
            const cachedState = terminalStateCache.get(actualSessionId) ?? result.buffer;
            if (cachedState) {
              const tryRestore = (attemptsLeft: number) => {
                if (terminalRef.current) {
                  terminalRef.current.clear();
                  terminalRef.current.write(cachedState);
                } else if (attemptsLeft > 0) {
                  setTimeout(() => tryRestore(attemptsLeft - 1), 100);
                }
              };
              tryRestore(30);
            }
          }
        } else {
          console.error('Failed to start shell session:', result.error);
        }
      } catch (error) {
        console.error('Failed to start shell session:', error);
      }
    };

    startSession();

    return () => {
      // Cleanup listeners
      cleanupRef.current.forEach((cleanup) => cleanup());
      cleanupRef.current = [];
    };
  }, [selectedWorktree, getAdapter, terminalSessions, addTerminalSession, removeTerminalSession]);

  // Cleanup split terminal on unmount
  useEffect(() => {
    return () => {
      splitCleanupRef.current.forEach((cleanup) => cleanup());
      splitCleanupRef.current = [];
      if (splitSaveIntervalRef.current) {
        clearInterval(splitSaveIntervalRef.current);
        splitSaveIntervalRef.current = null;
      }
    };
  }, []);

  // Periodic state saving for split terminal
  useEffect(() => {
    if (!splitSessionId) return;

    splitSaveIntervalRef.current = setInterval(() => {
      if (splitSessionId) {
        try {
          const terminalInstance = (window as any)[`terminal_${splitSessionId}`];
          if (terminalInstance?.serialize) {
            const serializedState = terminalInstance.serialize();
            if (serializedState) {
              terminalStateCache.set(splitSessionId, serializedState);
            }
          }
        } catch (error) {
          console.error('Failed to save split terminal state:', error);
        }
      }
    }, 5000);

    return () => {
      if (splitSessionId) {
        try {
          const terminalInstance = (window as any)[`terminal_${splitSessionId}`];
          if (terminalInstance?.serialize) {
            const serializedState = terminalInstance.serialize();
            if (serializedState) {
              terminalStateCache.set(splitSessionId, serializedState);
            }
          }
        } catch (error) {
          console.error('Failed to save split terminal state on unmount:', error);
        }
      }

      if (splitSaveIntervalRef.current) {
        clearInterval(splitSaveIntervalRef.current);
        splitSaveIntervalRef.current = null;
      }
    };
  }, [splitSessionId]);

  // Trigger resize when split state changes to ensure proper 50/50 layout
  useEffect(() => {
    const handleSplitResize = () => {
      // Small delay to ensure DOM has updated
      setTimeout(() => {
        // Trigger resize for both terminals by dispatching window resize event
        window.dispatchEvent(new Event('resize'));
      }, 100);
    };

    if (isSplit || (!isSplit && splitSessionId === null)) {
      handleSplitResize();
    }
  }, [isSplit, splitSessionId]);

  // Periodic state saving and cleanup (like desktop app)
  useEffect(() => {
    if (!sessionId) return;

    // Start periodic saving every 5 seconds (like desktop app)
    saveIntervalRef.current = setInterval(() => {
      if (sessionId) {
        try {
          const terminalInstance = (window as any)[`terminal_${sessionId}`];
          if (terminalInstance?.serialize) {
            const serializedState = terminalInstance.serialize();
            if (serializedState) {
              terminalStateCache.set(sessionId, serializedState);
              console.log('💾 Periodic save for session:', sessionId);
            }
          }
        } catch (error) {
          console.error('Failed to save terminal state:', error);
        }
      }
    }, 5000);

    return () => {
      // Save state before component unmount (like desktop app)
      if (sessionId) {
        try {
          const terminalInstance = (window as any)[`terminal_${sessionId}`];
          if (terminalInstance?.serialize) {
            const serializedState = terminalInstance.serialize();
            if (serializedState) {
              terminalStateCache.set(sessionId, serializedState);
              console.log('💾 Final save on unmount for session:', sessionId);
            }
          }
        } catch (error) {
          console.error('Failed to save terminal state on unmount:', error);
        }
      }

      // Clear interval
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
        saveIntervalRef.current = null;
      }
    };
  }, [sessionId]);

  const handleTerminalData = async (data: string) => {
    if (!sessionId) {
      return;
    }

    const adapter = getAdapter();
    if (!adapter) {
      return;
    }

    try {
      await adapter.writeToShell(sessionId, data);
    } catch (error) {
      console.error('Failed to write to shell:', error);
    }
  };

  const handleTerminalResize = async (cols: number, rows: number) => {
    if (!sessionId) return;

    const adapter = getAdapter();
    if (!adapter) return;

    try {
      await adapter.resizeShell(sessionId, cols, rows);
    } catch (error) {
      console.error('Failed to resize shell:', error);
    }
  };

  const handleTerminalReady = (terminal: XTerm) => {
    terminalRef.current = terminal;
  };

  const handleSplitTerminalData = async (data: string) => {
    if (!splitSessionId) return;

    const adapter = getAdapter();
    if (!adapter) return;

    try {
      await adapter.writeToShell(splitSessionId, data);
    } catch (error) {
      console.error('Failed to write to split shell:', error);
    }
  };

  const handleSplitTerminalResize = async (cols: number, rows: number) => {
    if (!splitSessionId) return;

    const adapter = getAdapter();
    if (!adapter) return;

    try {
      await adapter.resizeShell(splitSessionId, cols, rows);
    } catch (error) {
      console.error('Failed to resize split shell:', error);
    }
  };

  const handleSplitTerminalReady = (terminal: XTerm) => {
    splitTerminalRef.current = terminal;
  };

  const handleBack = () => {
    if (activeProject) {
      setSelectedWorktree(activeProject.id, null);
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const toggleSplit = async () => {
    if (isSplit) {
      // Close split terminal
      if (splitSessionId) {
        // Clean up event listeners
        splitCleanupRef.current.forEach((cleanup) => cleanup());
        splitCleanupRef.current = [];

        terminalStateCache.delete(splitSessionId);
        removeTerminalSession(`${selectedWorktree}_split`);
        setSplitSessionId(null);
      }
      setIsSplit(false);
    } else {
      // Open split terminal
      setIsSplit(true);
      const adapter = getAdapter();
      if (!adapter || !selectedWorktree) return;

      try {
        const result = await adapter.startShell(selectedWorktree, undefined, undefined, true); // forceNew = true for split
        if (result.success && result.processId) {
          const actualSessionId = result.processId;

          // Set up event listeners for split terminal
          const unsubscribeOutput = adapter.onShellOutput(actualSessionId, (data) => {
            if (splitTerminalRef.current) {
              splitTerminalRef.current.write(data);
            }
          });

          const unsubscribeExit = adapter.onShellExit(actualSessionId, (code) => {
            if (splitTerminalRef.current) {
              splitTerminalRef.current.write(`\r\n[Process exited with code ${code}]\r\n`);
            }
            terminalStateCache.delete(actualSessionId);
            removeTerminalSession(`${selectedWorktree}_split`);
            setSplitSessionId(null);
            setIsSplit(false);
          });

          splitCleanupRef.current = [unsubscribeOutput, unsubscribeExit];
          setSplitSessionId(actualSessionId);
          addTerminalSession(`${selectedWorktree}_split`, actualSessionId);
        }
      } catch (error) {
        console.error('Failed to start split shell session:', error);
        setIsSplit(false);
      }
    }
  };

  const closeSplitTerminal = () => {
    if (splitSessionId) {
      // Clean up event listeners
      splitCleanupRef.current.forEach((cleanup) => cleanup());
      splitCleanupRef.current = [];

      terminalStateCache.delete(splitSessionId);
      removeTerminalSession(`${selectedWorktree}_split`);
      setSplitSessionId(null);
    }
    setIsSplit(false);
  };

  if (!selectedWorktree) return null;

  return (
    <div className={`flex flex-col w-full h-full ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* Terminal Headers */}
      <div className={`flex ${isSplit ? 'flex-row' : ''} bg-background`}>
        <div
          className={`${isSplit ? 'w-1/2' : 'w-full'} h-14 px-4 border-b flex items-center justify-between flex-shrink-0`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={handleBack}
              className="md:hidden p-1 hover:bg-accent rounded flex-shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h3 className="font-semibold truncate">Terminal</h3>
              <p className="text-xs text-muted-foreground truncate">
                {selectedWorktree?.split('/').slice(-2).join('/')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSplit}
              className="p-1 hover:bg-accent rounded"
              title="Split Terminal"
            >
              <Columns2 className="h-4 w-4" />
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-1 hover:bg-accent rounded"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {/* Split terminal header */}
        {isSplit && (
          <div className="w-1/2 h-14 px-4 border-b border-l flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="min-w-0">
                <h3 className="font-semibold truncate">Terminal (Split)</h3>
                <p className="text-xs text-muted-foreground truncate">
                  {selectedWorktree?.split('/').slice(-2).join('/')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSplit}
                className="p-1 hover:bg-accent rounded"
                title="Split Terminal"
              >
                <Columns2 className="h-4 w-4" />
              </button>
              <button
                onClick={closeSplitTerminal}
                className="p-1 hover:bg-accent rounded"
                title="Close Split Terminal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Terminal Container */}
      <div
        className={`flex-1 flex ${isSplit ? 'flex-row' : ''} ${theme === 'light' ? 'bg-white' : 'bg-black'}`}
      >
        <div className={`${isSplit ? 'w-1/2 border-r' : 'w-full'} h-full`}>
          {sessionId && (
            <Terminal
              id={sessionId}
              onData={handleTerminalData}
              onResize={handleTerminalResize}
              onReady={handleTerminalReady}
              config={{
                theme: theme,
                fontSize: 14,
                cursorBlink: true
              }}
            />
          )}
          {!sessionId && (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>Starting terminal session...</p>
            </div>
          )}
        </div>
        {isSplit && (
          <div className="w-1/2 h-full">
            {splitSessionId && (
              <Terminal
                id={splitSessionId}
                onData={handleSplitTerminalData}
                onResize={handleSplitTerminalResize}
                onReady={handleSplitTerminalReady}
                config={{
                  theme: theme,
                  fontSize: 14,
                  cursorBlink: true
                }}
              />
            )}
            {!splitSessionId && (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>Starting split terminal session...</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
