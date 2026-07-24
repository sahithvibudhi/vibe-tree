import { Terminal, GitBranch } from 'lucide-react';

export type ViewTab = 'terminal' | 'changes' | 'preview';

interface ViewSwitchProps {
  active: ViewTab;
  onChange: (tab: ViewTab) => void;
}

/**
 * Segmented Terminal/Changes control shown in each view's toolbar, so the
 * app needs no separate tab bar row.
 */
export function ViewSwitch({ active, onChange }: ViewSwitchProps) {
  const base =
    'flex items-center gap-1.5 px-2.5 h-6 text-xs font-medium rounded transition-colors';
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
      <button
        className={`${base} ${
          active === 'terminal'
            ? 'bg-background text-foreground border shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => onChange('terminal')}
      >
        <Terminal className="h-3.5 w-3.5" />
        Terminal
      </button>
      <button
        className={`${base} ${
          active === 'changes'
            ? 'bg-background text-foreground border shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => onChange('changes')}
      >
        <GitBranch className="h-3.5 w-3.5" />
        Changes
      </button>
    </div>
  );
}
