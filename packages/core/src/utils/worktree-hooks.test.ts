import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  findWorktreeHook,
  runWorktreeHook,
  runWorktreeHookIfPresent
} from './worktree-hooks';

const isPosix = process.platform !== 'win32';

describe.skipIf(!isPosix)('worktree hooks', () => {
  let projectPath: string;
  let worktreePath: string;

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'vibetree-hooks-project-'));
    worktreePath = fs.mkdtempSync(path.join(os.tmpdir(), 'vibetree-hooks-worktree-'));
  });

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true });
    fs.rmSync(worktreePath, { recursive: true, force: true });
  });

  function writeHook(name: string, script: string, mode = 0o755): string {
    const hooksDir = path.join(projectPath, '.vibetree', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    const hookPath = path.join(hooksDir, name);
    fs.writeFileSync(hookPath, script, { mode });
    return hookPath;
  }

  const context = () => ({ projectPath, worktreePath, branch: 'feature-x' });

  it('returns undefined when no hook exists', async () => {
    const result = await runWorktreeHookIfPresent('post-create', context());
    expect(result).toBeUndefined();
  });

  it('ignores hooks without the executable bit', () => {
    writeHook('post-create', '#!/bin/sh\necho hi\n', 0o644);
    expect(findWorktreeHook(projectPath, 'post-create')).toBeNull();
  });

  it('runs a hook with the worktree as cwd and env vars set', async () => {
    writeHook(
      'post-create',
      '#!/bin/sh\necho "cwd=$(pwd)"\necho "hook=$VIBETREE_HOOK branch=$VIBETREE_BRANCH"\necho "project=$VIBETREE_PROJECT_PATH"\necho "worktree=$VIBETREE_WORKTREE_PATH"\n'
    );

    const result = await runWorktreeHookIfPresent('post-create', context());

    expect(result).toBeDefined();
    expect(result!.ok).toBe(true);
    expect(result!.exitCode).toBe(0);
    expect(result!.output).toContain(`cwd=${fs.realpathSync(worktreePath)}`);
    expect(result!.output).toContain('hook=post-create branch=feature-x');
    expect(result!.output).toContain(`project=${projectPath}`);
    expect(result!.output).toContain(`worktree=${worktreePath}`);
  });

  it('reports non-zero exit codes without throwing', async () => {
    writeHook('pre-remove', '#!/bin/sh\necho about to fail\nexit 3\n');

    const result = await runWorktreeHookIfPresent('pre-remove', context());

    expect(result!.ok).toBe(false);
    expect(result!.exitCode).toBe(3);
    expect(result!.timedOut).toBe(false);
    expect(result!.output).toContain('about to fail');
  });

  it('kills a hook that exceeds the timeout', async () => {
    const hookPath = writeHook('post-create', '#!/bin/sh\nsleep 30\n');

    const result = await runWorktreeHook(hookPath, 'post-create', context(), 300);

    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
  }, 10000);

  it('caps captured output', async () => {
    writeHook('post-create', '#!/bin/sh\nhead -c 200000 /dev/zero | tr "\\0" "x"\n');

    const result = await runWorktreeHookIfPresent('post-create', context());

    expect(result!.ok).toBe(true);
    expect(result!.output.length).toBeLessThanOrEqual(65536);
  });

  it('refuses a hooks directory symlinked outside the project', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'vibetree-outside-'));
    try {
      fs.writeFileSync(path.join(outside, 'post-create'), '#!/bin/sh\necho pwned\n', {
        mode: 0o755
      });
      fs.mkdirSync(path.join(projectPath, '.vibetree'));
      fs.symlinkSync(outside, path.join(projectPath, '.vibetree', 'hooks'));

      expect(findWorktreeHook(projectPath, 'post-create')).toBeNull();
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
