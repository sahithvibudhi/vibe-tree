import { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { TerminalGrid } from './TerminalGrid';
import { GitDiffView } from './GitDiffView';
import { Terminal, GitBranch } from 'lucide-react';

interface RightPaneViewProps {
  worktreePath: string;
  projectId?: string;
  theme?: 'light' | 'dark';
}

export function RightPaneView({ worktreePath, projectId, theme }: RightPaneViewProps) {
  const [activeTab, setActiveTab] = useState('terminal');

  // Fired by the Worktree menu accelerator; only the visible pane is mounted
  useEffect(() => {
    const toggle = () => setActiveTab((tab) => (tab === 'terminal' ? 'git-diff' : 'terminal'));
    window.addEventListener('vibetree:toggle-view', toggle);
    return () => window.removeEventListener('vibetree:toggle-view', toggle);
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="border-b border-border/60 flex items-center h-10 px-2 flex-shrink-0">
          <TabsList className="h-7 bg-muted p-0.5 rounded-md gap-0.5">
            <TabsTrigger
              value="terminal"
              className="h-6 rounded px-2.5 text-xs font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm flex items-center gap-1.5"
            >
              <Terminal className="h-3.5 w-3.5" />
              Terminal
            </TabsTrigger>
            <TabsTrigger
              value="git-diff"
              className="h-6 rounded px-2.5 text-xs font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm flex items-center gap-1.5"
            >
              <GitBranch className="h-3.5 w-3.5" />
              Changes
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="terminal" className="flex-1 m-0 h-full">
          <TerminalGrid worktreePath={worktreePath} projectId={projectId} theme={theme} />
        </TabsContent>

        <TabsContent value="git-diff" className="flex-1 m-0 h-full">
          <GitDiffView worktreePath={worktreePath} theme={theme} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
