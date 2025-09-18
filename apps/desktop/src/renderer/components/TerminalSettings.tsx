import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Settings } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { useToast } from './ui/use-toast';
import type { TerminalSettings, TerminalSettingsUpdate } from '../types/terminal-settings';

interface TerminalSettingsProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function TerminalSettings({ trigger, open: controlledOpen, onOpenChange }: TerminalSettingsProps) {
  const [settings, setSettings] = useState<TerminalSettings | null>(null);
  const [availableFonts, setAvailableFonts] = useState<string[]>([]);
  const [customFont, setCustomFont] = useState('');
  const [internalOpen, setInternalOpen] = useState(false);
  const { toast } = useToast();

  // Use controlled open state if provided, otherwise use internal state
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  useEffect(() => {
    // Load initial settings
    window.electronAPI.terminalSettings.get().then(setSettings);
    // Load available fonts
    window.electronAPI.terminalSettings.getFonts().then(setAvailableFonts);
  }, []);

  const handleFontChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === 'custom') {
      setCustomFont(settings?.fontFamily || '');
      return;
    }
    updateSettings({ fontFamily: value });
  };

  const handleCustomFontApply = () => {
    if (customFont.trim()) {
      updateSettings({ fontFamily: customFont.trim() });
    }
  };

  const handleFontSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const size = parseInt(e.target.value);
    if (size >= 8 && size <= 48) {
      updateSettings({ fontSize: size });
    }
  };

  const handleCursorBlinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateSettings({ cursorBlink: e.target.checked });
  };

  const handleScrollbackChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const scrollback = parseInt(e.target.value);
    if (scrollback >= 100 && scrollback <= 50000) {
      updateSettings({ scrollback });
    }
  };

  const handleTabStopWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const width = parseInt(e.target.value);
    if (width >= 1 && width <= 8) {
      updateSettings({ tabStopWidth: width });
    }
  };

  const updateSettings = async (updates: TerminalSettingsUpdate) => {
    try {
      await window.electronAPI.terminalSettings.update(updates);
      // Reload settings to get updated values
      const newSettings = await window.electronAPI.terminalSettings.get();
      setSettings(newSettings);
      toast({
        title: "Settings Updated",
        description: "Terminal settings have been saved.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update settings.",
        variant: "destructive",
      });
    }
  };

  const resetSettings = async () => {
    try {
      await window.electronAPI.terminalSettings.reset();
      const newSettings = await window.electronAPI.terminalSettings.get();
      setSettings(newSettings);
      toast({
        title: "Settings Reset",
        description: "Terminal settings have been reset to defaults.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reset settings.",
        variant: "destructive",
      });
    }
  };

  if (!settings) {
    return null;
  }

  const dialogContent = (
    <>
      <DialogHeader>
        <DialogTitle>Terminal Settings</DialogTitle>
        <DialogDescription>
          Customize the appearance and behavior of all terminals. Changes apply universally.
        </DialogDescription>
      </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Font Family */}
          <div className="space-y-2">
            <label htmlFor="fontFamily" className="text-sm font-medium">
              Font Family
            </label>
            <select
              id="fontFamily"
              value={availableFonts.includes(settings.fontFamily) ? settings.fontFamily : 'custom'}
              onChange={handleFontChange}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              {availableFonts.map((font) => (
                <option key={font} value={font}>
                  {font.split(',')[0].replace(/"/g, '')}
                </option>
              ))}
              <option value="custom">Custom Font...</option>
            </select>
          </div>

          {/* Custom Font Input */}
          {(!availableFonts.includes(settings.fontFamily) || customFont) && (
            <div className="space-y-2">
              <label htmlFor="customFont" className="text-sm font-medium">
                Custom Font
              </label>
              <div className="flex gap-2">
                <Input
                  id="customFont"
                  value={customFont || settings.fontFamily}
                  onChange={(e) => setCustomFont(e.target.value)}
                  placeholder='e.g., "Fira Code", monospace'
                  className="flex-1"
                />
                <Button size="sm" onClick={handleCustomFontApply}>
                  Apply
                </Button>
              </div>
            </div>
          )}

          {/* Font Size */}
          <div className="space-y-2">
            <label htmlFor="fontSize" className="text-sm font-medium">
              Font Size
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="fontSize"
                type="number"
                min={8}
                max={48}
                value={settings.fontSize}
                onChange={handleFontSizeChange}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">px</span>
            </div>
          </div>

          {/* Cursor Blink */}
          <div className="flex items-center justify-between">
            <label htmlFor="cursorBlink" className="text-sm font-medium">
              Cursor Blink
            </label>
            <input
              id="cursorBlink"
              type="checkbox"
              checked={settings.cursorBlink}
              onChange={handleCursorBlinkChange}
              className="w-4 h-4"
            />
          </div>

          {/* Scrollback */}
          <div className="space-y-2">
            <label htmlFor="scrollback" className="text-sm font-medium">
              Scrollback Buffer
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="scrollback"
                type="number"
                min={100}
                max={50000}
                value={settings.scrollback}
                onChange={handleScrollbackChange}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">lines</span>
            </div>
          </div>

          {/* Tab Width */}
          <div className="space-y-2">
            <label htmlFor="tabStopWidth" className="text-sm font-medium">
              Tab Width
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="tabStopWidth"
                type="number"
                min={1}
                max={8}
                value={settings.tabStopWidth}
                onChange={handleTabStopWidthChange}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">spaces</span>
            </div>
          </div>
        </div>
        <div className="flex justify-between">
          <Button variant="outline" onClick={resetSettings}>
            Reset to Defaults
          </Button>
          <Button onClick={() => setOpen(false)}>Done</Button>
        </div>
    </>
  );

  // If no trigger is provided and we're controlled, render without DialogTrigger
  if (!trigger && controlledOpen !== undefined) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[425px]">
          {dialogContent}
        </DialogContent>
      </Dialog>
    );
  }

  // Otherwise render with trigger
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" title="Terminal Settings">
            <Settings className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        {dialogContent}
      </DialogContent>
    </Dialog>
  );
}