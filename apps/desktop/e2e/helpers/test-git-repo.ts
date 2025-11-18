import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

export interface CreateTestRepoOptions {
  /** Custom name suffix for the repository directory (default: 'repo') */
  nameSuffix?: string;
  /** Whether to create a worktree in addition to the main repo */
  createWorktree?: boolean;
  /** Name of the worktree branch (default: 'test-branch') */
  worktreeBranch?: string;
}

export interface TestRepoResult {
  /** Path to the main repository */
  repoPath: string;
  /** Path to the worktree (if created) */
  worktreePath?: string;
}

/**
 * Helper function to create a dummy git repository for testing
 * @param options - Configuration options for repo creation
 * @returns Path(s) to the created repository
 */
export function createTestGitRepo(options: CreateTestRepoOptions = {}): TestRepoResult {
  const {
    nameSuffix = 'repo',
    createWorktree = false,
    worktreeBranch = 'test-branch'
  } = options;

  const timestamp = Date.now();
  const repoPath = path.join(os.tmpdir(), `dummy-${nameSuffix}-${timestamp}`);

  // Create the directory and initialize git repo
  fs.mkdirSync(repoPath, { recursive: true });
  execSync('git init -q', { cwd: repoPath });
  execSync('git config user.email "test@example.com"', { cwd: repoPath });
  execSync('git config user.name "Test User"', { cwd: repoPath });

  // Create a dummy file and make initial commit (required for branches/worktrees)
  fs.writeFileSync(path.join(repoPath, 'README.md'), '# Test Repository\n');
  execSync('git add .', { cwd: repoPath });
  execSync('git commit -q -m "Initial commit"', { cwd: repoPath });

  // Create main branch (some git versions don't create it by default)
  try {
    execSync('git branch -M main', { cwd: repoPath });
  } catch (e) {
    // Ignore if branch already exists
  }

  console.log('Created dummy repo at:', repoPath);

  const result: TestRepoResult = { repoPath };

  // Create a worktree if requested
  if (createWorktree) {
    const worktreePath = path.join(os.tmpdir(), `dummy-${worktreeBranch}-${timestamp}`);
    execSync(`git worktree add -b ${worktreeBranch} "${worktreePath}"`, { cwd: repoPath });
    console.log('Created worktree at:', worktreePath);
    result.worktreePath = worktreePath;
  }

  return result;
}

/**
 * Helper function to clean up a test git repository
 * @param repoPath - Path to the repository to clean up
 * @param worktreePath - Optional path to worktree to clean up
 */
export function cleanupTestGitRepo(repoPath: string | undefined, worktreePath?: string): void {
  // Clean up the worktree directory if it exists
  if (worktreePath && fs.existsSync(worktreePath)) {
    try {
      fs.rmSync(worktreePath, { recursive: true, force: true });
      console.log('Cleaned up test worktree');
    } catch (e) {
      console.error('Failed to clean up test worktree:', e);
    }
  }

  // Clean up the repository
  if (repoPath && fs.existsSync(repoPath)) {
    try {
      fs.rmSync(repoPath, { recursive: true, force: true });
      console.log('Cleaned up dummy repo');
    } catch (e) {
      console.error('Failed to clean up dummy repo:', e);
    }
  }
}
