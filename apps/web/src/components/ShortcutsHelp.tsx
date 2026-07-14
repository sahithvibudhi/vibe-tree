import { useEffect } from 'react';
import { X } from 'lucide-react';
import { SHORTCUTS } from '../hooks/useKeyboardShortcuts';

export function KeyChips({ keys }: { keys: string[] }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((key) => (
        <kbd
          key={key}
          className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono text-muted-foreground"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-background border rounded-lg shadow-lg w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Keyboard shortcuts"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Keyboard shortcuts</h3>
            <button
              onClick={onClose}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="space-y-2.5">
            {SHORTCUTS.map((shortcut) => (
              <li key={shortcut.action} className="flex items-center justify-between gap-4">
                <span className="text-sm">{shortcut.action}</span>
                <KeyChips keys={shortcut.keys} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
