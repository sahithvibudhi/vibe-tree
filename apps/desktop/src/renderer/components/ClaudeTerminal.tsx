import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SerializeAddon } from '@xterm/addon-serialize';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Code2, Columns2, X } from 'lucide-react';
import { useToast } from './ui/use-toast';
import '@xterm/xterm/css/xterm.css';

interface ClaudeTerminalProps {
  worktreePath: string;
  projectId?: string;
  theme?: 'light' | 'dark';
  isVisible?: boolean;
  terminalId?: string;
  onSplit?: () => void;
  onClose?: () => void;
  canClose?: boolean;
  onProcessIdChange?: (processId: string) => void;
}

// Cache for terminal states per worktree
const terminalStateCache = new Map<string, string>();

export function ClaudeTerminal({ 
  worktreePath, 
  theme = 'dark', 
  isVisible = true, 
  terminalId,
  onSplit,
  onClose,
  canClose = false,
  onProcessIdChange
}: ClaudeTerminalProps) {
  // Log when component renders to verify it only happens once per terminal
  console.log(`[ClaudeTerminal] Rendering terminal for: ${worktreePath}`);
  const terminalRef = useRef<HTMLDivElement>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const processIdRef = useRef<string>('');
  const fitAddonRef = useRef<FitAddon | null>(null);
  const serializeAddonRef = useRef<SerializeAddon | null>(null);
  const removeListenersRef = useRef<Array<() => void>>([]);
  const [detectedIDEs, setDetectedIDEs] = useState<Array<{ name: string; command: string }>>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (!terminalRef.current) return;

    console.log(`[ClaudeTerminal] Initializing terminal for: ${worktreePath}`);

    // Create terminal instance with theme-aware colors
    const getTerminalTheme = (currentTheme: 'light' | 'dark') => {
      if (currentTheme === 'light') {
        return {
          background: '#ffffff',
          foreground: '#000000',
          cursor: '#000000',
          cursorAccent: '#ffffff',
          selectionBackground: '#b5b5b5',
          black: '#000000',
          red: '#cd3131',
          green: '#0dbc79',
          yellow: '#e5e510',
          blue: '#2472c8',
          magenta: '#bc3fbc',
          cyan: '#11a8cd',
          white: '#e5e5e5',
          brightBlack: '#666666',
          brightRed: '#f14c4c',
          brightGreen: '#23d18b',
          brightYellow: '#f5f543',
          brightBlue: '#3b8eea',
          brightMagenta: '#d670d6',
          brightCyan: '#29b8db',
          brightWhite: '#e5e5e5'
        };
      } else {
        return {
          background: '#000000',
          foreground: '#ffffff',
          cursor: '#ffffff',
          cursorAccent: '#000000',
          selectionBackground: '#4a4a4a',
          black: '#000000',
          red: '#cd3131',
          green: '#0dbc79',
          yellow: '#e5e510',
          blue: '#2472c8',
          magenta: '#bc3fbc',
          cyan: '#11a8cd',
          white: '#e5e5e5',
          brightBlack: '#666666',
          brightRed: '#f14c4c',
          brightGreen: '#23d18b',
          brightYellow: '#f5f543',
          brightBlue: '#3b8eea',
          brightMagenta: '#d670d6',
          brightCyan: '#29b8db',
          brightWhite: '#e5e5e5'
        };
      }
    };

    const term = new Terminal({
      theme: getTerminalTheme(theme),
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      allowTransparency: false,
      scrollback: 10000,
      tabStopWidth: 4,
      // Handle screen clearing properly
      windowsMode: false,
      // Allow proposed API for Unicode11 addon
      allowProposedApi: true,
      // Enable Option key as Meta on macOS
      macOptionIsMeta: true
    });

    // Add addons
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    
    // Configure WebLinksAddon with custom handler for opening links
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      // Open in default browser using Electron's shell.openExternal
      window.electronAPI.shell.openExternal(uri);
    });
    term.loadAddon(webLinksAddon);
    
    const serializeAddon = new SerializeAddon();
    serializeAddonRef.current = serializeAddon;
    term.loadAddon(serializeAddon);
    
    const unicode11Addon = new Unicode11Addon();
    term.loadAddon(unicode11Addon);

    // Open terminal in container
    term.open(terminalRef.current);
    
    // Load fit addon after terminal is opened
    term.loadAddon(fitAddon);
    
    // Activate unicode addon
    unicode11Addon.activate(term);
    
    // Fit and focus after a small delay to ensure proper rendering
    setTimeout(() => {
      try {
        // Ensure the terminal container has dimensions before fitting
        if (terminalRef.current && terminalRef.current.offsetWidth > 0 && terminalRef.current.offsetHeight > 0) {
          fitAddon.fit();
        }
        term.focus();
      } catch (err) {
        console.error('Error during initial fit:', err);
        // Try to focus without fit
        term.focus();
      }
    }, 100);

    setTerminal(term);

    // Handle bell character - play sound when bell is triggered
    const bellDisposable = term.onBell(() => {
      console.log('Bell triggered in ClaudeTerminal!');
      // Create an audio element and play the bell sound
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhCSuBzvLZijYIG2m98OGiUSATVqzn77FgGwc4k9n1znksBSh+zPLaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSN3yfDTgDAJInfN9NuLOgoUYrfp56ZSFApGn+DyvmwhCSuBzvLZijYIG2m98OGiUSATVqzn77FgGwc4k9n1znksBSh+zPLaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQ==');
      audio.volume = 0.5; // Set volume to 50%
      console.log('Playing bell sound at 50% volume...');
      audio.play()
        .then(() => {
          console.log('Bell sound played successfully');
        })
        .catch(err => {
          console.error('Bell sound playback failed:', err);
        });
    });

    // Handle resize (both window resize and container resize)
    const handleResize = () => {
      // Only fit if the terminal container has dimensions
      if (terminalRef.current && terminalRef.current.offsetWidth > 0 && terminalRef.current.offsetHeight > 0) {
        try {
          fitAddon.fit();
          // Resize the PTY to match terminal dimensions
          if (processIdRef.current) {
            window.electronAPI.shell.resize(
              processIdRef.current, 
              term.cols, 
              term.rows
            );
          }
        } catch (err) {
          console.error('Error during resize fit:', err);
        }
      }
    };

    // Listen to window resize
    window.addEventListener('resize', handleResize);
    
    // Create ResizeObserver to watch for container size changes (e.g., when splitting terminals)
    const resizeObserver = new ResizeObserver(() => {
      // Debounce resize to avoid excessive calls
      clearTimeout((window as any).resizeDebounceTimer);
      (window as any).resizeDebounceTimer = setTimeout(() => {
        handleResize();
      }, 100);
    });
    
    // Observe the terminal container
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      console.log(`[ClaudeTerminal] Cleanup for: ${worktreePath}`);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      // Clean up listeners
      removeListenersRef.current.forEach(remove => remove());
      removeListenersRef.current = [];
      bellDisposable.dispose();
      term.dispose();
    };
  }, []); // Empty dependency array - terminal only initializes once

  // Save terminal state before unmounting or changing worktree
  useEffect(() => {
    return () => {
      if (terminal && serializeAddonRef.current && processIdRef.current) {
        // Save the current terminal state
        const serializedState = serializeAddonRef.current.serialize();
        terminalStateCache.set(processIdRef.current, serializedState);
      }
    };
  }, [terminal, worktreePath]);


  // Track process ID in state for proper effect dependencies
  const [currentProcessId, setCurrentProcessId] = useState<string>('');
  
  // Notify parent about process ID changes
  useEffect(() => {
    if (currentProcessId && onProcessIdChange) {
      onProcessIdChange(currentProcessId);
    }
  }, [currentProcessId, onProcessIdChange]);

  // Terminal cleanup is now handled by TerminalManager when closing
  // This component no longer handles PTY termination directly

  // Auto-start shell when worktree changes
  useEffect(() => {
    if (!terminal || !worktreePath) return;

    // Clean up old listeners first
    removeListenersRef.current.forEach(remove => remove());
    removeListenersRef.current = [];

    const startShell = async () => {
      try {
        // Get current terminal dimensions
        const cols = terminal.cols;
        const rows = terminal.rows;
        
        const result = await window.electronAPI.shell.start(worktreePath, cols, rows, false, terminalId);
        
        if (!result.success) {
          terminal.writeln(`\r\nError: ${result.error || 'Failed to start shell'}\r\n`);
          return;
        }

        processIdRef.current = result.processId!;
        setCurrentProcessId(result.processId!);
        console.log(`Shell started: ${result.processId}, isNew: ${result.isNew}, worktree: ${worktreePath}`);

        // Handle terminal state
        if (result.isNew) {
          // Clear terminal for new shells
          terminal.clear();
        } else {
          // Restore cached state for existing shells
          const cachedState = terminalStateCache.get(result.processId!);
          terminal.clear();
          
          // Use setTimeout to ensure terminal is ready
          setTimeout(() => {
            if (cachedState) {
              terminal.write(cachedState);
            }
          }, 50);
        }
        
        // Focus terminal
        terminal.focus();
        
        // Set initial PTY size
        if (fitAddonRef.current && terminalRef.current) {
          // Give the terminal time to render before fitting
          setTimeout(() => {
            try {
              // Ensure the terminal container has dimensions
              if (terminalRef.current && terminalRef.current.offsetWidth > 0 && terminalRef.current.offsetHeight > 0) {
                fitAddonRef.current!.fit();
                window.electronAPI.shell.resize(
                  result.processId!,
                  terminal.cols,
                  terminal.rows
                );
              } else {
                // Use default dimensions if container not ready
                window.electronAPI.shell.resize(
                  result.processId!,
                  80,
                  24
                );
              }
            } catch (err) {
              console.error('Error during PTY resize fit:', err);
              // Still try to resize with default cols/rows
              window.electronAPI.shell.resize(
                result.processId!,
                80,
                24
              );
            }
          }, 100);
        }

        // Handle terminal input - simply pass it to the PTY
        const disposable = terminal.onData((data) => {
          if (processIdRef.current) {
            window.electronAPI.shell.write(processIdRef.current, data);
          }
        });

        // Set up output listener - simply pass data to terminal
        const removeOutputListener = window.electronAPI.shell.onOutput(result.processId!, (data) => {
          terminal.write(data);
        });

        // Set up exit listener
        const removeExitListener = window.electronAPI.shell.onExit(result.processId!, (code) => {
          terminal.writeln(`\r\n[Shell exited with code ${code}]`);
          processIdRef.current = '';
        });

        // Periodically save terminal state
        const saveInterval = setInterval(() => {
          if (serializeAddonRef.current && processIdRef.current) {
            const serializedState = serializeAddonRef.current.serialize();
            terminalStateCache.set(processIdRef.current, serializedState);
          }
        }, 5000); // Save every 5 seconds

        // Store listeners for cleanup
        removeListenersRef.current = [
          () => disposable.dispose(),
          removeOutputListener,
          removeExitListener,
          () => clearInterval(saveInterval)
        ];

      } catch (error) {
        terminal.writeln(`\r\nError starting shell: ${error}\r\n`);
      }
    };

    startShell();

    return () => {
      // Save state before cleaning up
      if (serializeAddonRef.current && processIdRef.current) {
        const serializedState = serializeAddonRef.current.serialize();
        terminalStateCache.set(processIdRef.current, serializedState);
      }
      
      // Clean up listeners when worktree changes
      removeListenersRef.current.forEach(remove => remove());
      removeListenersRef.current = [];
    };
  }, [terminal, worktreePath]);

  // Detect available IDEs
  useEffect(() => {
    window.electronAPI.ide.detect().then(setDetectedIDEs);
  }, []);

  // Update theme when prop changes
  useEffect(() => {
    if (!terminal) return;

    const getTerminalTheme = (currentTheme: 'light' | 'dark') => {
      if (currentTheme === 'light') {
        return {
          background: '#ffffff',
          foreground: '#000000',
          cursor: '#000000',
          cursorAccent: '#ffffff',
          selectionBackground: '#b5b5b5'
        };
      } else {
        return {
          background: '#000000',
          foreground: '#ffffff',
          cursor: '#ffffff',
          cursorAccent: '#000000',
          selectionBackground: '#4a4a4a'
        };
      }
    };

    terminal.options.theme = getTerminalTheme(theme);
  }, [terminal, theme]);

  // Handle visibility changes - focus terminal when it becomes visible
  useEffect(() => {
    if (!terminal || !isVisible) return;

    console.log(`[ClaudeTerminal] Terminal visibility changed for ${worktreePath}: ${isVisible}`);
    
    // Immediate resize attempt
    if (fitAddonRef.current && terminalRef.current) {
      try {
        if (terminalRef.current.offsetWidth > 0 && terminalRef.current.offsetHeight > 0) {
          fitAddonRef.current.fit();
          // Also resize the PTY to match the new terminal dimensions
          if (processIdRef.current) {
            window.electronAPI.shell.resize(
              processIdRef.current,
              terminal.cols,
              terminal.rows
            );
          }
        }
      } catch (err) {
        console.error('Error fitting terminal on visibility change (immediate):', err);
      }
    }
    
    // Also do it after a small delay to ensure DOM is fully ready
    const focusTimeout = setTimeout(() => {
      terminal.focus();
      
      // Retry resize to ensure proper rendering
      if (fitAddonRef.current && terminalRef.current) {
        try {
          if (terminalRef.current.offsetWidth > 0 && terminalRef.current.offsetHeight > 0) {
            fitAddonRef.current.fit();
            // Also resize the PTY to match the new terminal dimensions
            if (processIdRef.current) {
              window.electronAPI.shell.resize(
                processIdRef.current,
                terminal.cols,
                terminal.rows
              );
            }
          }
        } catch (err) {
          console.error('Error fitting terminal on visibility change (delayed):', err);
        }
      }
    }, 100);

    return () => clearTimeout(focusTimeout);
  }, [terminal, isVisible]);

  const handleOpenInIDE = async (ideName: string) => {
    try {
      const result = await window.electronAPI.ide.open(ideName, worktreePath);
      if (!result.success) {
        toast({
          title: "Error",
          description: result.error || "Failed to open IDE",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to open IDE",
        variant: "destructive",
      });
    }
  };




  return (
    <div className="claude-terminal-root flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="terminal-header h-[57px] px-4 border-b flex items-center justify-between flex-shrink-0">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Terminal</h3>
          <p className="text-xs text-muted-foreground truncate">{worktreePath}</p>
        </div>
        <div className="flex items-center gap-1">
          {onSplit && (
            <Button
              size="icon"
              variant="ghost"
              onClick={onSplit}
              title="Split Terminal Vertically"
            >
              <Columns2 className="h-4 w-4" />
            </Button>
          )}
          {canClose && onClose && (
            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
              title="Close Terminal"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          {detectedIDEs.length > 0 && (
            detectedIDEs.length === 1 ? (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleOpenInIDE(detectedIDEs[0].name)}
                title={`Open in ${detectedIDEs[0].name}`}
              >
                <Code2 className="h-4 w-4" />
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost">
                    <Code2 className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {detectedIDEs.map((ide) => (
                    <DropdownMenuItem
                      key={ide.name}
                      onClick={() => handleOpenInIDE(ide.name)}
                    >
                      Open in {ide.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )
          )}
        </div>
      </div>

      {/* Terminal container */}
      <div 
        ref={terminalRef} 
        className={`terminal-xterm-container flex-1 h-full ${theme === 'light' ? 'bg-white' : 'bg-black'}`}
        style={{ minHeight: '100px' }}
      />
    </div>
  );
}