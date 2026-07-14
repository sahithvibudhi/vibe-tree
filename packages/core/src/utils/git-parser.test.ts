import { describe, it, expect } from 'vitest';
import { parseWorktrees, parseGitStatus, extractBranchName, isMainBranch } from './git-parser';

describe('parseWorktrees', () => {
  it('should parse worktrees with branches', () => {
    const output = `worktree /Users/user/project
HEAD abc123def456
branch refs/heads/main

worktree /Users/user/project-feature
HEAD def456ghi789
branch refs/heads/feature-branch
`;

    const worktrees = parseWorktrees(output);

    expect(worktrees).toHaveLength(2);
    expect(worktrees[0]).toEqual({
      path: '/Users/user/project',
      head: 'abc123def456',
      branch: 'refs/heads/main'
    });
    expect(worktrees[1]).toEqual({
      path: '/Users/user/project-feature',
      head: 'def456ghi789',
      branch: 'refs/heads/feature-branch'
    });
  });

  it('should parse worktrees with detached HEAD (no branch)', () => {
    const output = `worktree /Users/user/project
HEAD abc123def456
branch refs/heads/main

worktree /Users/user/project-detached
HEAD 2f74501b1234567890abcdef
`;

    const worktrees = parseWorktrees(output);

    // This test currently fails because parseWorktrees filters out worktrees without a branch
    expect(worktrees).toHaveLength(2);
    expect(worktrees[0]).toEqual({
      path: '/Users/user/project',
      head: 'abc123def456',
      branch: 'refs/heads/main'
    });
    expect(worktrees[1]).toEqual({
      path: '/Users/user/project-detached',
      head: '2f74501b1234567890abcdef',
      branch: undefined
    });
  });

  it('should handle mixed worktrees with some having detached HEAD', () => {
    const output = `worktree /Users/phuongnd08/code/vibe-tree
HEAD f5d94d31
branch refs/heads/main

worktree /Users/phuongnd08/code/vibe-tree-simplify-terminal-listener
HEAD 2f74501b

worktree /Users/phuongnd08/code/vibe-tree-use-reverse-portal
HEAD 305c9630
`;

    const worktrees = parseWorktrees(output);

    // All three worktrees should be included, even those with detached HEAD
    expect(worktrees).toHaveLength(3);
    expect(worktrees[0].path).toBe('/Users/phuongnd08/code/vibe-tree');
    expect(worktrees[0].branch).toBe('refs/heads/main');
    expect(worktrees[1].path).toBe('/Users/phuongnd08/code/vibe-tree-simplify-terminal-listener');
    expect(worktrees[1].branch).toBeUndefined();
    expect(worktrees[2].path).toBe('/Users/phuongnd08/code/vibe-tree-use-reverse-portal');
    expect(worktrees[2].branch).toBeUndefined();
  });

  it('should handle empty output', () => {
    const worktrees = parseWorktrees('');
    expect(worktrees).toEqual([]);
  });
});

describe('parseGitStatus', () => {
  it('should parse git status output correctly', () => {
    const output = `M  src/file1.ts
 M src/file2.ts
?? new-file.js
A  added-file.ts`;

    const status = parseGitStatus(output);

    expect(status).toHaveLength(4);
    expect(status[0]).toEqual({
      path: 'src/file1.ts',
      status: 'M ',
      staged: true,
      modified: false
    });
    expect(status[1]).toEqual({
      path: 'src/file2.ts',
      status: ' M',
      staged: false,
      modified: true
    });
    expect(status[2]).toEqual({
      path: 'new-file.js',
      status: '??',
      staged: false,
      modified: false
    });
    expect(status[3]).toEqual({
      path: 'added-file.ts',
      status: 'A ',
      staged: true,
      modified: false
    });
  });

  it('should handle empty output', () => {
    const status = parseGitStatus('');
    expect(status).toEqual([]);
  });
});

describe('extractBranchName', () => {
  it('should extract branch name from refs format', () => {
    expect(extractBranchName('refs/heads/main')).toBe('main');
    expect(extractBranchName('refs/heads/feature/branch')).toBe('feature/branch');
  });

  it('should return original string if not in refs format', () => {
    expect(extractBranchName('main')).toBe('main');
    expect(extractBranchName('feature-branch')).toBe('feature-branch');
  });
});

describe('isMainBranch', () => {
  it('should identify main branches', () => {
    expect(isMainBranch('main')).toBe(true);
    expect(isMainBranch('master')).toBe(true);
    expect(isMainBranch('refs/heads/main')).toBe(true);
    expect(isMainBranch('refs/heads/master')).toBe(true);
  });

  it('should not identify feature branches as main', () => {
    expect(isMainBranch('feature')).toBe(false);
    expect(isMainBranch('develop')).toBe(false);
    expect(isMainBranch('refs/heads/feature')).toBe(false);
  });
});
