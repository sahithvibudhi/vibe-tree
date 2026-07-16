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
      className={`h-11 border-b flex items-center gap-2 flex-shrink-0 select-none ${
        IS_MAC ? 'pl-[78px] pr-2' : 'pl-3 pr-[140px]'
      }`}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      data-testid="titlebar"
    >
      {onToggleSidebar && (
        <Button
          size="icon"
          variant="ghost"
          onClick={onToggleSidebar}
          title="Toggle sidebar (Cmd/Ctrl+B)"
          className="h-7 w-7"
          style={noDrag}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      )}

      {/* h1 keeps the app title as the page's top-level heading for
          accessibility (and the e2e suite locates the app by it) */}
      <h1 className="text-sm font-semibold tracking-tight flex-shrink-0">VibeTree</h1>

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
        className="h-7 w-7"
        style={noDrag}
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
    </div>
  );
}
