import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export interface DirectoryEntry {
  name: string;
  path: string;
  isGitRepo: boolean;
}

export interface DirectoryListing {
  path: string;
  parent: string | null;
  isGitRepo: boolean;
  entries: DirectoryEntry[];
  truncated: boolean;
}

export interface DiscoveredRepo {
  name: string;
  path: string;
}

// Caps keep a single request bounded even on huge or network-mounted
// directories; the client can always navigate deeper
const MAX_ENTRIES = 200;
const DISCOVER_MAX_DEPTH = 3;
const DISCOVER_MAX_REPOS = 25;
const DISCOVER_TIMEOUT_MS = 3000;

// Dependency trees and VCS internals are never project roots; skipping
// them keeps discovery fast
const DISCOVER_SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'vendor', 'target']);

async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(dirPath, '.git'));
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

/**
 * List the sub-directories of a directory (never files: this powers a
 * project picker, and file contents are not its business). Hidden entries
 * are skipped unless asked for. The path is resolved through realpath so
 * the client always sees canonical paths.
 */
export async function listDirectory(
  requestedPath: string,
  options: { showHidden?: boolean } = {}
): Promise<DirectoryListing> {
  const resolved = await fs.realpath(requestedPath || os.homedir());

  const dirents = await fs.readdir(resolved, { withFileTypes: true });
  const dirNames = dirents
    .filter((d) => d.isDirectory() || d.isSymbolicLink())
    .map((d) => d.name)
    .filter((name) => options.showHidden || !name.startsWith('.'))
    .sort((a, b) => a.localeCompare(b));

  const truncated = dirNames.length > MAX_ENTRIES;
  const limited = dirNames.slice(0, MAX_ENTRIES);

  const entries: DirectoryEntry[] = [];
  for (const name of limited) {
    const entryPath = path.join(resolved, name);
    try {
      const stat = await fs.stat(entryPath);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }
    entries.push({ name, path: entryPath, isGitRepo: await isGitRepo(entryPath) });
  }

  const parent = path.dirname(resolved);
  return {
    path: resolved,
    parent: parent === resolved ? null : parent,
    isGitRepo: await isGitRepo(resolved),
    entries,
    truncated
  };
}

/**
 * Shallow breadth-first scan of the given roots for git repositories.
 * Bounded by depth, repo count, and wall-clock time so it can never hang
 * the landing page; a partial result is still useful.
 */
export async function discoverRepos(
  roots: string[],
  options: {
    maxDepth?: number;
    maxRepos?: number;
    timeoutMs?: number;
  } = {}
): Promise<DiscoveredRepo[]> {
  const maxDepth = options.maxDepth ?? DISCOVER_MAX_DEPTH;
  const maxRepos = options.maxRepos ?? DISCOVER_MAX_REPOS;
  const timeoutMs = options.timeoutMs ?? DISCOVER_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  const found = new Map<string, DiscoveredRepo>();
  const queue: Array<{ dir: string; depth: number }> = [];

  for (const root of roots) {
    try {
      queue.push({ dir: await fs.realpath(root), depth: 0 });
    } catch {
      // Nonexistent root: skip rather than fail the whole scan
    }
  }

  while (queue.length > 0 && found.size < maxRepos && Date.now() < deadline) {
    const { dir, depth } = queue.shift()!;

    if (await isGitRepo(dir)) {
      found.set(dir, { name: path.basename(dir), path: dir });
      // A repo's subdirectories are part of that project, not new projects
      continue;
    }

    if (depth >= maxDepth) continue;

    let dirents;
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const dirent of dirents) {
      if (!dirent.isDirectory()) continue;
      if (dirent.name.startsWith('.') || DISCOVER_SKIP.has(dirent.name)) continue;
      queue.push({ dir: path.join(dir, dirent.name), depth: depth + 1 });
    }
  }

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}
