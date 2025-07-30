import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SerializeAddon } from '@xterm/addon-serialize';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Code2 } from 'lucide-react';
import { useToast } from './ui/use-toast';
import '@xterm/xterm/css/xterm.css';

interface ClaudeTerminalProps {
  worktreePath: string;
  projectId?: string;
}

// Cache for terminal states per worktree
const terminalStateCache = new Map<string, string>();

export function ClaudeTerminal({ worktreePath }: ClaudeTerminalProps) {
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


    // Create terminal instance
    const term = new Terminal({
      theme: {
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
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      allowTransparency: false,
      convertEol: true,
      scrollback: 10000,
      tabStopWidth: 4,
      // Handle screen clearing properly
      windowsMode: false,
      // Allow proposed API for Unicode11 addon
      allowProposedApi: true
    });

    // Add addons
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);
    
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(webLinksAddon);
    
    const serializeAddon = new SerializeAddon();
    serializeAddonRef.current = serializeAddon;
    term.loadAddon(serializeAddon);
    
    const unicode11Addon = new Unicode11Addon();
    term.loadAddon(unicode11Addon);

    // Open terminal in container
    term.open(terminalRef.current);
    
    // Activate unicode addon
    unicode11Addon.activate(term);
    
    // Fit and focus after a small delay to ensure proper rendering
    setTimeout(() => {
      fitAddon.fit();
      term.focus();
    }, 10);

    setTerminal(term);

    // Handle window resize
    const handleResize = () => {
      // Only fit if the terminal container has dimensions
      if (terminalRef.current && terminalRef.current.offsetWidth > 0 && terminalRef.current.offsetHeight > 0) {
        fitAddon.fit();
        // Resize the PTY to match terminal dimensions
        if (processIdRef.current) {
          window.electronAPI.shell.resize(
            processIdRef.current, 
            term.cols, 
            term.rows
          );
        }
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      // Clean up listeners
      removeListenersRef.current.forEach(remove => remove());
      removeListenersRef.current = [];
      term.dispose();
    };
  }, []);

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
        
        const result = await window.electronAPI.shell.start(worktreePath, cols, rows);
        
        if (!result.success) {
          terminal.writeln(`\r\nError: ${result.error || 'Failed to start shell'}\r\n`);
          return;
        }

        processIdRef.current = result.processId!;

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
          fitAddonRef.current.fit();
          window.electronAPI.shell.resize(
            result.processId!,
            terminal.cols,
            terminal.rows
          );
        }

        // Handle terminal input - simply pass it to the PTY
        const disposable = terminal.onData((data) => {
          if (processIdRef.current) {
            window.electronAPI.shell.write(processIdRef.current, data);
          }
        });

        // Set up output listener with special handling for Claude
        let lastWasClear = false;
        const removeOutputListener = window.electronAPI.shell.onOutput(result.processId!, (data) => {
          // Check if Claude is trying to clear the screen
          if (data.includes('\x1b[2J') && data.includes('\x1b[H')) {
            // Claude is clearing screen and moving cursor home
            terminal.clear();
            terminal.write('\x1b[H');
            lastWasClear = true;
            
            // Write any remaining data after the clear sequence
            // eslint-disable-next-line no-control-regex
            const afterClear = data.split(/\x1b\[2J.*?\x1b\[H/)[1];
            if (afterClear) {
              terminal.write(afterClear);
            }
          } else if (lastWasClear && data.startsWith('\n')) {
            // Skip extra newlines after clear
            lastWasClear = false;
            terminal.write(data.substring(1));
          } else {
            lastWasClear = false;
            terminal.write(data);
          }
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

  // Update theme
  useEffect(() => {
    if (!terminal) return;

    const updateTheme = async () => {
      const theme = await window.electronAPI.theme.get();
      if (theme === 'dark') {
        terminal.options.theme = {
          background: '#000000',
          foreground: '#ffffff',
        };
      } else {
        terminal.options.theme = {
          background: '#ffffff',
          foreground: '#000000',
        };
      }
    };

    updateTheme();
    window.electronAPI.theme.onChange(updateTheme);
  }, [terminal]);

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
    <div className="flex-1 flex flex-col h-full">
      <div className="h-[57px] px-4 border-b flex items-center justify-between flex-shrink-0">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Terminal</h3>
          <p className="text-xs text-muted-foreground truncate">{worktreePath}</p>
        </div>
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

      <div 
        ref={terminalRef} 
        className="flex-1 min-h-0 bg-black"
        style={{ minHeight: '100px' }}
      />
    </div>
  );
}