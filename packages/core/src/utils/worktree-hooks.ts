import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { HookResult } from '../types';

export type WorktreeHookName = 'post-create' | 'pre-remove';

const HOOK_TIMEOUT_MS = 120000;
const MAX_OUTPUT_LENGTH = 65536;

export interface WorktreeHookContext {
  projectPath: string;
  worktreePath: string;
  branch: string;
}

/**
 * Find an executable lifecycle hook for a project.
 *
 * Hooks are per-project scripts at .vibetree/hooks/<name> in the main
 * repository, following the git-hooks trust model: creating an executable
 * file there is the opt-in. Nothing runs unless the repo owner added it.
 */
export function findWorktreeHook(projectPath: string, name: WorktreeHookName): string | null {
  const hooksDir = path.join(projectPath, '.vibetree', 'hooks');

  let realHooksDir: string;
  try {
    realHooksDir = fs.realpathSync(hooksDir);
  } catch {
    return null;
  }

  // Refuse a hooks directory symlinked outside the project: a hostile
  // checkout should not be able to point hooks at arbitrary scripts
  const realProject = fs.realpathSync(projectPath);
  if (!realHooksDir.startsWith(realProject + path.sep) && realHooksDir !== realProject) {
    console.warn(`Ignoring .vibetree/hooks outside project: ${realHooksDir}`);
    return null;
  }

  const hookPath = path.join(realHooksDir, name);
  try {
    const stat = fs.statSync(hookPath);
    if (!stat.isFile()) return null;
    // On POSIX the executable bit is the explicit opt-in
    if (process.platform !== 'win32') {
      fs.accessSync(hookPath, fs.constants.X_OK);
    }
    return hookPath;
  } catch {
    return null;
  }
}

/**
 * Run a lifecycle hook with the worktree as cwd. Output (both streams) is
 * captured and capped; the hook is killed after a timeout so a hung script
 * cannot wedge worktree operations.
 */
export function runWorktreeHook(
  hookPath: string,
  name: WorktreeHookName,
  context: WorktreeHookContext,
  timeoutMs: number = HOOK_TIMEOUT_MS
): Promise<HookResult> {
  return new Promise((resolve) => {
    let output = '';
    let timedOut = false;

    const append = (chunk: Buffer) => {
      if (output.length < MAX_OUTPUT_LENGTH) {
        output += chunk.toString('utf8').slice(0, MAX_OUTPUT_LENGTH - output.length);
      }
    };

    // spawn (not exec): the hook path must never pass through a shell.
    // detached puts the hook in its own process group so a timeout can kill
    // the whole tree, not just the top-level script
    const child = spawn(hookPath, [], {
      cwd: context.worktreePath,
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        VIBETREE_HOOK: name,
        VIBETREE_PROJECT_PATH: context.projectPath,
        VIBETREE_WORKTREE_PATH: context.worktreePath,
        VIBETREE_BRANCH: context.branch
      }
    });

    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform !== 'win32' && child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      } else {
        child.kill('SIGKILL');
      }
    }, timeoutMs);

    child.stdout.on('data', append);
    child.stderr.on('data', append);

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        name,
        ok: false,
        exitCode: null,
        timedOut: false,
        output: `Failed to run hook: ${error.message}`
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        name,
        ok: !timedOut && code === 0,
        exitCode: code,
        timedOut,
        output: output.trim()
      });
    });
  });
}

/**
 * Find and run a hook if the project defines one. Returns undefined when no
 * hook exists, so callers can tell "no hook" from "hook ran".
 */
export async function runWorktreeHookIfPresent(
  name: WorktreeHookName,
  context: WorktreeHookContext,
  timeoutMs?: number
): Promise<HookResult | undefined> {
  const hookPath = findWorktreeHook(context.projectPath, name);
  if (!hookPath) return undefined;

  console.log(`Running ${name} hook for ${context.worktreePath}`);
  return runWorktreeHook(hookPath, name, context, timeoutMs);
}
