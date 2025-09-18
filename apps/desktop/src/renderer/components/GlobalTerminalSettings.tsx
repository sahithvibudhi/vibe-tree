import { useState, useEffect } from 'react';
import { TerminalSettings } from './TerminalSettings';

export function GlobalTerminalSettings() {
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    // Listen for menu command to open terminal settings
    const unsubscribe = window.electronAPI.menu.onOpenTerminalSettings(() => {
      setShowSettings(true);
    });

    return unsubscribe;
  }, []);

  return (
    <TerminalSettings
      open={showSettings}
      onOpenChange={setShowSettings}
    />
  );
}