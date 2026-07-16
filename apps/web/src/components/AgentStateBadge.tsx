import type { AgentState } from '../hooks/useAgentStates';

const STYLES: Record<AgentState, { dot: string; label: string }> = {
  working: { dot: 'bg-foreground animate-pulse', label: 'Agent working' },
  'needs-input': { dot: 'bg-yellow-500', label: 'Agent needs input' },
  done: { dot: 'bg-green-500', label: 'Agent done' },
  idle: { dot: 'bg-muted-foreground/50', label: 'Session idle' }
};

/**
 * Compact state dot for worktree rows; state carries the meaning the old
 * plain live-session dot could not (working, waiting on you, done).
 */
export function AgentStateDot({ state }: { state: AgentState }) {
  const style = STYLES[state];
  return (
    <span
      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`}
      title={style.label}
      data-testid={`agent-state-${state}`}
    />
  );
}

export function AgentStateLabel({ state }: { state: AgentState }) {
  const text =
    state === 'needs-input'
      ? 'needs input'
      : state === 'working'
        ? 'working'
        : state === 'done'
          ? 'done'
          : 'idle';
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <AgentStateDot state={state} />
      {text}
    </span>
  );
}
