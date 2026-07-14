import { useState } from 'react';
import { X, GitBranch, TerminalSquare, Smartphone } from 'lucide-react';

const STORAGE_KEY = 'vibetree.hasSeenOnboarding';

export function OnboardingHint() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');

  if (dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setDismissed(true);
  };

  return (
    <div className="mx-4 mt-4 rounded-lg border bg-muted/30 p-4" data-testid="onboarding-hint">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">Welcome to VibeTree</h3>
        <button
          onClick={dismiss}
          className="p-1 hover:bg-accent rounded"
          aria-label="Dismiss welcome hint"
          data-testid="onboarding-dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        Run AI coding agents in parallel git worktrees, from any device. Works with Claude Code,
        Codex, Gemini CLI, Aider, or any terminal program.
      </p>
      <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        <li className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 flex-shrink-0" />
          Create a worktree per task; each gets its own branch and directory
        </li>
        <li className="flex items-center gap-2">
          <TerminalSquare className="h-4 w-4 flex-shrink-0" />
          Open its terminal and launch your agent; sessions survive page reloads
        </li>
        <li className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 flex-shrink-0" />
          Install this page as an app to check on your agents from your phone
        </li>
      </ul>
    </div>
  );
}
