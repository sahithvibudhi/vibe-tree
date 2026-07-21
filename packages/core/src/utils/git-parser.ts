import { Worktree, GitStatus } from '../types';

/**
 * Parses the output of `git worktree list --porcelain` command
 * @param output - Raw output from git worktree list command
 * @returns Array of parsed worktree objects
 */
export function parseWorktrees(output: string): Worktree[] {
  const lines = output.trim().split('\n');
  const worktrees: Worktree[] = [];
  let current: Partial<Worktree> = {};

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      // If we have a complete worktree, add it to the array
      // A worktree is complete if it has at least a path and head
      // Branch is optional (can be undefined for detached HEAD)
      if (current.path && current.head) {
        worktrees.push(current as Worktree);
      }
      // Start a new worktree entry
      current = { path: line.substring(9) };
    } else if (line.startsWith('HEAD ')) {
      current.head = line.substring(5);
    } else if (line.startsWith('branch ')) {
      current.branch = line.substring(7);
    }
  }

  // Add the last worktree if complete
  // A worktree is complete if it has at least a path and head
  // Branch is optional (can be undefined for detached HEAD)
  if (current.path && current.head) {
    worktrees.push(current as Worktree);
  }

  return worktrees;
}

/**
 * Parses the output of `git status --porcelain=v1` command
 * @param output - Raw output from git status command
 * @returns Array of parsed git status objects
 */
export function parseGitStatus(output: string): GitStatus[] {
  // No trim on the whole output: the XY status prefix is positional, and a
  // leading space (unstaged-only change) on the first line is meaningful
  const lines = output.split('\n').filter((line) => line.trim().length > 0);

  return lines.map((line) => {
    // Git status format: XY filename
    // X = status in index, Y = status in working tree
    const statusCode = line.substring(0, 2);
    const filePath = line.substring(3);

    return {
      path: filePath,
      status: statusCode,
      staged: statusCode[0] !== ' ' && statusCode[0] !== '?',
      modified: statusCode[1] !== ' ' && statusCode[1] !== '?'
    };
  });
}

/**
 * Extracts branch name from refs format
 * @param ref - Git ref string (e.g., "refs/heads/main")
 * @returns Clean branch name (e.g., "main")
 */
export function extractBranchName(ref: string): string {
  if (ref.startsWith('refs/heads/')) {
    return ref.substring('refs/heads/'.length);
  }
  return ref;
}

/**
 * Determines if a branch is a main/master branch
 * @param branchName - Name of the branch
 * @returns True if branch is main or master
 */
export function isMainBranch(branchName: string): boolean {
  const cleanName = extractBranchName(branchName);
  return cleanName === 'main' || cleanName === 'master';
}
