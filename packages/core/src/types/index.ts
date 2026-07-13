export interface Worktree {
  path: string;
  branch?: string; // Optional - can be undefined for detached HEAD
  head: string;
}

export interface GitStatus {
  path: string;
  status: string;
  staged: boolean;
  modified: boolean;
}

export interface ShellSession {
  processId: string;
  worktreePath: string;
  isNew: boolean;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  worktrees: Worktree[];
  selectedWorktree: string | null;
}

export interface IDE {
  name: string;
  command: string;
}

export interface ShellStartResult {
  success: boolean;
  processId?: string;
  isNew?: boolean;
  error?: string;
  /** Buffered scrollback for reattached sessions, when the transport provides it */
  buffer?: string;
}

export interface ShellWriteResult {
  success: boolean;
  error?: string;
}

export interface ShellResizeResult {
  success: boolean;
  error?: string;
}

export interface HookResult {
  name: string;
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  output: string;
}

export interface WorktreeAddResult {
  path: string;
  branch: string;
  hook?: HookResult;
}

export interface WorktreeRemoveResult {
  success: boolean;
  warning?: string;
  hook?: HookResult;
}

export interface ProjectValidationResult {
  path: string;
  name?: string;
  valid: boolean;
  error?: string;
}
