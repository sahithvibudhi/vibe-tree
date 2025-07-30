import { Button } from './ui/button';
import { Moon, Sun, Bell, BellOff } from 'lucide-react';
import { useState, useEffect } from 'react';

interface AppHeaderProps {
  className?: string;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
}

export function AppHeader({ className = '', theme, onThemeToggle }: AppHeaderProps) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    // Load notification preference from localStorage
    const saved = localStorage.getItem('notificationsEnabled');
    if (saved !== null) {
      setNotificationsEnabled(saved === 'true');
    }
  }, []);

  const toggleNotifications = () => {
    const newValue = !notificationsEnabled;
    setNotificationsEnabled(newValue);
    localStorage.setItem('notificationsEnabled', String(newValue));
  };

  return (
    <div 
      className={`border-b relative select-none ${className}`}
      style={{ 
        WebkitAppRegion: 'drag',
        paddingTop: '32px',
        paddingBottom: '16px',
        paddingLeft: '16px',
        paddingRight: '16px'
      } as React.CSSProperties}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 
            className="text-2xl font-bold cursor-text select-text" 
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            VibeTree
          </h1>
          <p 
            className="text-muted-foreground mt-1 cursor-text select-text" 
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            Vibe code with AI in parallel git worktrees
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={toggleNotifications}
            className="rounded-full"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            title={notificationsEnabled ? 'Disable notifications' : 'Enable notifications'}
          >
            {notificationsEnabled ? (
              <Bell className="h-5 w-5" />
            ) : (
              <BellOff className="h-5 w-5" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onThemeToggle}
            className="rounded-full"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}