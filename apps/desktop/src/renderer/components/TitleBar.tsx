import { ReactNode } from 'react';
import { Button } from './ui/button';
import { Moon, Sun, PanelLeft } from 'lucide-react';

const IS_MAC = navigator.platform.toUpperCase().includes('MAC');

interface TitleBarProps {
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onToggleSidebar?: () => void;
  children?: ReactNode;
}

const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

/**
 * Single compact titlebar in the Linear/Slack style: it is the window drag
 * region and carries the project tabs and window-level controls, instead
 * of a banner header stacked above separate tab rows. On macOS the left
 * padding clears the inset traffic lights; on Windows/Linux the right
 * padding clears the titleBarOverlay window controls.
 */
export function TitleBar({ theme, onThemeToggle, onToggleSidebar, children }: TitleBarProps) {
  return (
    <div
      className={`h-10 border-b border-border/60 flex items-center gap-1.5 flex-shrink-0 select-none ${
        IS_MAC ? 'pl-[78px] pr-2' : 'pl-2 pr-[140px]'
      }`}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      data-testid="titlebar"
    >
      {/* The brand lives in the OS chrome (menu bar, dock, window title);
          inside the window it is a screen-reader-only heading so the page
          keeps a top-level h1 (the e2e suite also reads it) */}
      <h1 className="sr-only">VibeTree</h1>

      {onToggleSidebar && (
        <Button
          size="icon"
          variant="ghost"
          onClick={onToggleSidebar}
          title="Toggle sidebar (Cmd/Ctrl+B)"
          className="h-6 w-6 text-muted-foreground"
          style={noDrag}
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </Button>
      )}

      {/* Project tabs (and the add button) live inside the drag region;
          each interactive element opts out individually */}
      <div className="flex-1 min-w-0 flex items-center h-full" style={noDrag}>
        {children}
      </div>

      <Button
        size="icon"
        variant="ghost"
        onClick={onThemeToggle}
        title="Toggle theme"
        className="h-6 w-6 text-muted-foreground"
        style={noDrag}
      >
        {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
