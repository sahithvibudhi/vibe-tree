import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import { Button } from './ui/button';
import { GitBranch, TerminalSquare, FolderOpen, Blocks, Keyboard } from 'lucide-react';

interface OnboardingDialogProps {
  open: boolean;
  onComplete: () => void;
  onOpenProject: () => void;
}

const steps = [
  {
    icon: Blocks,
    title: 'Welcome to VibeTree',
    body: 'VibeTree runs each AI coding agent in its own git worktree, so several agents can work on the same repository in parallel without stepping on each other. It works with any CLI: Claude Code, Codex, Gemini CLI, Aider, or plain shells.'
  },
  {
    icon: FolderOpen,
    title: 'Open a project',
    body: 'Start by opening a git repository. Every project gets its own tab, and its worktrees appear in the left panel.'
  },
  {
    icon: GitBranch,
    title: 'Create a worktree per task',
    body: 'Create a worktree for each task or conversation. VibeTree makes a sibling directory with a new branch, and a post-create hook (.vibetree/hooks/post-create) can set it up automatically.'
  },
  {
    icon: TerminalSquare,
    title: 'Run your AI agent',
    body: 'Each worktree opens a persistent terminal. Launch your agent there (for example, type "claude"), split terminals, schedule commands, and review diffs in the Changes tab. Sessions survive reloads and keep running in the background.'
  },
  {
    icon: Keyboard,
    title: 'Keyboard shortcuts',
    body: 'Create a worktree with Cmd/Ctrl+Shift+K, toggle Terminal and Changes with Cmd/Ctrl+Shift+E, and jump between worktrees with Cmd/Ctrl+Alt+Up and Down. All of these live in the Worktree menu too.'
  }
];

export function OnboardingDialog({ open, onComplete, onOpenProject }: OnboardingDialogProps) {
  const [step, setStep] = useState(0);
  const isLast = step === steps.length - 1;
  const { icon: Icon, title, body } = steps[step];

  const finish = () => {
    setStep(0);
    onComplete();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && finish()}>
      <DialogContent className="sm:max-w-md" data-testid="onboarding-dialog">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Icon className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center">{title}</DialogTitle>
          <DialogDescription className="text-center">{body}</DialogDescription>
        </DialogHeader>

        <div className="flex justify-center gap-1.5 py-2">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-6 rounded-full ${i === step ? 'bg-foreground' : 'bg-muted'}`}
            />
          ))}
        </div>

        <DialogFooter className="sm:justify-between gap-2">
          <Button variant="ghost" onClick={finish} data-testid="onboarding-skip">
            Skip
          </Button>
          {isLast ? (
            <Button
              onClick={() => {
                finish();
                onOpenProject();
              }}
              data-testid="onboarding-open-project"
            >
              Open a project
            </Button>
          ) : (
            <Button onClick={() => setStep(step + 1)} data-testid="onboarding-next">
              Next
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
