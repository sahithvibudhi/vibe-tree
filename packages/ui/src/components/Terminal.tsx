import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SerializeAddon } from '@xterm/addon-serialize';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import '@xterm/xterm/css/xterm.css';

/**
 * Configuration options for the Terminal component
 */
export interface TerminalConfig {
  fontSize?: number;
  fontFamily?: string;
  theme?: 'light' | 'dark';
  cursorBlink?: boolean;
  scrollback?: number;
  tabStopWidth?: number;
}

/**
 * Props for the Terminal component
 */
export interface TerminalProps {
  /**
   * Unique identifier for this terminal instance
   */
  id: string;
  
  /**
   * Configuration options for terminal appearance and behavior
   */
  config?: TerminalConfig;
  
  /**
   * Callback when user inputs data in the terminal
   */
  onData?: (data: string) => void;
  
  /**
   * Callback when terminal is resized
   */
  onResize?: (cols: number, rows: number) => void;
  
  /**
   * Callback when terminal is ready
   */
  onReady?: (terminal: XTerm) => void;
  
  /**
   * CSS class name for the terminal container
   */
  className?: string;
}

/**
 * Get terminal color theme based on light/dark mode
 */
const getTerminalTheme = (theme: 'light' | 'dark') => {
  const themes = {
    light: {
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
    },
    dark: {
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
    }
  };
  
  return themes[theme];
};

/**
 * Terminal component that provides a cross-platform terminal interface
 * using xterm.js. Supports both desktop (Electron) and web environments.
 */
export const Terminal: React.FC<TerminalProps> = ({
  id,
  config = {},
  onData,
  onResize,
  onReady,
  className = ''
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [terminal, setTerminal] = useState<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const serializeAddonRef = useRef<SerializeAddon | null>(null);

  /**
   * Initialize terminal instance and addons
   */
  useEffect(() => {
    if (!terminalRef.current) return;

    const {
      fontSize = 14,
      fontFamily = 'Menlo, Monaco, "Courier New", monospace',
      theme = 'dark',
      cursorBlink = true,
      scrollback = 10000,
      tabStopWidth = 4
    } = config;

    // Detect if running on mobile device
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // Base terminal configuration shared by all platforms
    const baseTerminalConfig = {
      fontFamily,
      fontSize,
      lineHeight: 1.2,
      cursorBlink,
      allowTransparency: false,
      scrollback,
      tabStopWidth,
      windowsMode: false,
      allowProposedApi: true,
      macOptionIsMeta: true,
      fastScrollModifier: 'shift' as const
    };

    // Desktop-specific terminal configuration
    const desktopTerminalConfig = {
      ...baseTerminalConfig,
      fontSize,
      scrollback,
      rendererType: 'canvas' as const // Better performance on desktop
    };

    // Mobile-specific terminal configuration
    const mobileTerminalConfig = {
      ...baseTerminalConfig,
      fontSize: 12, // Smaller font on mobile for better readability
      scrollback: 1000, // Less scrollback on mobile for performance
      rendererType: 'dom' as const // Required for mobile compatibility
    };

    // Select appropriate configuration based on platform
    const terminalConfig = isMobile ? mobileTerminalConfig : desktopTerminalConfig;

    const term = new XTerm({
      ...terminalConfig,
      theme: getTerminalTheme(theme)
    });

    // Load addons for enhanced functionality
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);
    
    // Configure WebLinksAddon with custom handler for opening links
    const webLinksAddon = new WebLinksAddon((event, uri) => {
      // Check if we're in Electron environment
      if (window.electronAPI && window.electronAPI.shell && window.electronAPI.shell.openExternal) {
        // Open in default browser using Electron's shell.openExternal
        window.electronAPI.shell.openExternal(uri);
      } else {
        // Fallback to opening in new tab for web environment
        window.open(uri, '_blank');
      }
    });
    term.loadAddon(webLinksAddon);
    
    const serializeAddon = new SerializeAddon();
    serializeAddonRef.current = serializeAddon;
    term.loadAddon(serializeAddon);
    
    const unicode11Addon = new Unicode11Addon();
    term.loadAddon(unicode11Addon);

    // Open terminal in DOM container
    term.open(terminalRef.current);
    
    // Activate unicode support
    unicode11Addon.activate(term);
    
    // Fit terminal to container after render
    setTimeout(() => {
      fitAddon.fit();
      // Explicitly resize terminal to ensure PTY knows the dimensions
      term.resize(term.cols, term.rows);
      term.focus();
    }, 10);

    setTerminal(term);

    // Notify parent when terminal is ready
    if (onReady) {
      onReady(term);
    }

    // Handle window resize
    const handleResize = () => {
      if (terminalRef.current && terminalRef.current.offsetWidth > 0 && terminalRef.current.offsetHeight > 0) {
        // First, fit the terminal to the container
        fitAddon.fit();
        
        // Get the new dimensions after fitting
        const newCols = term.cols;
        const newRows = term.rows;
        
        // Explicitly resize the terminal to notify PTY of size change
        // This is crucial for applications like vim to handle resize properly
        term.resize(newCols, newRows);
        
        // Notify parent component of the resize
        if (onResize) {
          onResize(newCols, newRows);
        }
      }
    };

    window.addEventListener('resize', handleResize);

    // Also observe container size changes using ResizeObserver
    let resizeObserver: ResizeObserver | null = null;
    if (terminalRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(terminalRef.current);
    }

    // Handle terminal input
    const dataDisposable = term.onData((data) => {
      if (onData) {
        onData(data);
      }
    });

    // Handle bell character - play sound when bell is triggered
    const bellDisposable = term.onBell(() => {
      // Create an audio element and play the bell sound
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhCSuBzvLZijYIG2m98OGiUSATVqzn77FgGwc4k9n1znksBSh+zPLaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSN3yfDTgDAJInfN9NuLOgoUYrfp56ZSFApGn+DyvmwhCSuBzvLZijYIG2m98OGiUSATVqzn77FgGwc4k9n1znksBSh+zPLaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQ==');
      audio.volume = 0.5; // Set volume to 50%
      audio.play().catch(err => {
        // Silently fail if audio playback is blocked
        console.debug('Bell sound playback failed:', err);
      });
    });

    // Cleanup on unmount
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      dataDisposable.dispose();
      bellDisposable.dispose();
      term.dispose();
    };
  }, []);

  /**
   * Update terminal theme when config changes
   */
  useEffect(() => {
    if (!terminal || !config.theme) return;
    terminal.options.theme = getTerminalTheme(config.theme);
  }, [terminal, config.theme]);

  /**
   * Public API methods exposed via ref
   */
  useEffect(() => {
    if (!terminal) return;

    // Expose terminal API methods
    (window as any)[`terminal_${id}`] = {
      write: (data: string) => terminal.write(data),
      clear: () => terminal.clear(),
      focus: () => terminal.focus(),
      blur: () => terminal.blur(),
      serialize: () => serializeAddonRef.current?.serialize(),
      fit: () => fitAddonRef.current?.fit(),
      resize: (cols: number, rows: number) => {
        terminal.resize(cols, rows);
        // Also fit after resize to ensure proper display
        fitAddonRef.current?.fit();
      }
    };

    return () => {
      delete (window as any)[`terminal_${id}`];
    };
  }, [terminal, id]);

  return (
    <div 
      ref={terminalRef} 
      className={`terminal-container ${className}`}
      style={{ 
        width: '100%', 
        height: '100%',
        minHeight: '100px'
      }}
    />
  );
};

export default Terminal;
