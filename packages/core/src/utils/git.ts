import { spawn } from 'child_process';
import * as path from 'path';
import {
  Worktree,
  GitStatus,
  WorktreeAddResult,
  WorktreeRemoveResult,
  ProjectValidationResult
} from '../types';
import { parseWorktrees, parseGitStatus } from './git-parser';

/**
 * Execute a git command and return the output
 * @param args - Git command arguments
 * @param cwd - Working directory for the command
 * @returns Promise with command output
 */
export function executeGitCommand(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Try 'git' first, fallback to absolute path if not found
    const gitCommand = process.env.PATH?.includes('/usr/bin') ? 'git' : '/usr/bin/git';
    const child = spawn(gitCommand, args, {
      cwd,
      env: { ...process.env, PATH: process.env.PATH || '/usr/bin:/bin:/usr/local/bin' }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Git command failed: git ${args.join(' ')}`));
      }
    });
  });
}

/**
 * List all git worktrees for a project
 * @param projectPath - Path to the main git repository
 * @returns Array of worktree information
 */
export async function listWorktrees(projectPath: string): Promise<Worktree[]> {
  const output = await executeGitCommand(['worktree', 'list', '--porcelain'], projectPath);
  return parseWorktrees(output);
}

/**
 * Get git status for a worktree
 * @param worktreePath - Path to the git worktree
 * @returns Array of file status information
 */
export async function getGitStatus(worktreePath: string): Promise<GitStatus[]> {
  const output = await executeGitCommand(['status', '--porcelain=v1'], worktreePath);
  return parseGitStatus(output);
}

/**
 * Get git diff for unstaged changes
 * @param worktreePath - Path to the git worktree
 * @param filePath - Optional specific file to diff
 * @returns Diff output as string
 */
export async function getGitDiff(worktreePath: string, filePath?: string): Promise<string> {
  const args = ['diff'];
  if (filePath) {
    args.push(filePath);
  }
  return executeGitCommand(args, worktreePath);
}

/**
 * Get git diff for staged changes
 * @param worktreePath - Path to the git worktree
 * @param filePath - Optional specific file to diff
 * @returns Staged diff output as string
 */
export async function getGitDiffStaged(worktreePath: string, filePath?: string): Promise<string> {
  const args = ['diff', '--staged'];
  if (filePath) {
    args.push(filePath);
  }
  return executeGitCommand(args, worktreePath);
}

/**
 * Create a new git worktree with a new branch
 * @param projectPath - Path to the main git repository
 * @param branchName - Name for the new branch
 * @returns Result with new worktree path and branch name
 */
export async function addWorktree(
  projectPath: string,
  branchName: string
): Promise<WorktreeAddResult> {
  const worktreePath = path.join(projectPath, '..', `${path.basename(projectPath)}-${branchName}`);

  await executeGitCommand(['worktree', 'add', '-b', branchName, worktreePath], projectPath);

  return { path: worktreePath, branch: branchName };
}

/**
 * Remove a git worktree and optionally its branch
 * @param projectPath - Path to the main git repository
 * @param worktreePath - Path to the worktree to remove
 * @param branchName - Name of the branch to delete
 * @returns Result indicating success and any warnings
 */
export async function removeWorktree(
  projectPath: string,
  worktreePath: string,
  branchName: string
): Promise<WorktreeRemoveResult> {
  try {
    // First remove the worktree
    await executeGitCommand(['worktree', 'remove', worktreePath, '--force'], projectPath);

    try {
      // Then try to delete the branch
      await executeGitCommand(['branch', '-D', branchName], projectPath);
      return { success: true };
    } catch (branchError) {
      // If branch deletion fails, still consider it success since worktree was removed
      console.warn('Failed to delete branch but worktree was removed:', branchError);
      return {
        success: true,
        warning: `Worktree removed but failed to delete branch: ${branchError}`
      };
    }
  } catch (error) {
    throw new Error(`Failed to remove worktree: ${error}`);
  }
}

/**
 * Check if a path is a git repository
 * @param path - Path to check
 * @returns True if path is a git repository
 */
export async function isGitRepository(path: string): Promise<boolean> {
  try {
    await executeGitCommand(['rev-parse', '--git-dir'], path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current branch name
 * @param worktreePath - Path to the git worktree
 * @returns Current branch name
 */
export async function getCurrentBranch(worktreePath: string): Promise<string> {
  const output = await executeGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath);
  return output.trim();
}

/**
 * Validate multiple project paths
 * @param projectPaths - Array of project paths to validate
 * @returns Array of validation results
 */
export async function validateProjects(projectPaths: string[]): Promise<ProjectValidationResult[]> {
  const results = await Promise.allSettled(
    projectPaths.map(async (projectPath) => {
      try {
        // Check if directory exists by trying to access it
        const isGitRepo = await isGitRepository(projectPath);
        if (!isGitRepo) {
          return {
            path: projectPath,
            valid: false,
            error: 'Not a git repository'
          } as ProjectValidationResult;
        }

        // Get repository name from path
        const name = path.basename(projectPath);

        return {
          path: projectPath,
          name,
          valid: true
        } as ProjectValidationResult;
      } catch (error) {
        return {
          path: projectPath,
          valid: false,
          error: `Directory not accessible: ${(error as Error).message}`
        } as ProjectValidationResult;
      }
    })
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        path: projectPaths[index],
        valid: false,
        error: `Validation failed: ${result.reason}`
      };
    }
  });
}
