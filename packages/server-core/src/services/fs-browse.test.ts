import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { listDirectory, discoverRepos } from './fs-browse';

let root: string;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vibetree-fsbrowse-'));

  // root/
  //   code/
  //     repo-a/ (git)
  //     repo-b/ (git)
  //       packages/inner/  (must NOT be discovered: inside a repo)
  //     plain-dir/
  //       nested-repo/ (git, depth 3 from root)
  //     node_modules/skipme-repo/ (git, must be skipped)
  //   .hidden-dir/
  //   file.txt
  const mkRepo = async (p: string) => {
    await fs.mkdir(p, { recursive: true });
    execSync('git init -q', { cwd: p });
  };

  await mkRepo(path.join(root, 'code', 'repo-a'));
  await mkRepo(path.join(root, 'code', 'repo-b'));
  await fs.mkdir(path.join(root, 'code', 'repo-b', 'packages', 'inner'), { recursive: true });
  await mkRepo(path.join(root, 'code', 'plain-dir', 'nested-repo'));
  await mkRepo(path.join(root, 'code', 'node_modules', 'skipme-repo'));
  await fs.mkdir(path.join(root, '.hidden-dir'));
  await fs.writeFile(path.join(root, 'file.txt'), 'not a directory');
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('listDirectory', () => {
  it('lists directories only, skipping hidden ones by default', async () => {
    const listing = await listDirectory(root);
    const names = listing.entries.map((e) => e.name);
    expect(names).toContain('code');
    expect(names).not.toContain('file.txt');
    expect(names).not.toContain('.hidden-dir');
  });

  it('includes hidden directories when asked', async () => {
    const listing = await listDirectory(root, { showHidden: true });
    expect(listing.entries.map((e) => e.name)).toContain('.hidden-dir');
  });

  it('marks git repositories', async () => {
    const listing = await listDirectory(path.join(root, 'code'));
    const byName = Object.fromEntries(listing.entries.map((e) => [e.name, e.isGitRepo]));
    expect(byName['repo-a']).toBe(true);
    expect(byName['plain-dir']).toBe(false);
  });

  it('reports the parent directory and stops at the filesystem root', async () => {
    const listing = await listDirectory(path.join(root, 'code'));
    expect(listing.parent).toBe(await fs.realpath(root));
    const top = await listDirectory('/');
    expect(top.parent).toBeNull();
  });

  it('rejects nonexistent paths', async () => {
    await expect(listDirectory(path.join(root, 'no-such-dir'))).rejects.toThrow();
  });
});

describe('discoverRepos', () => {
  it('finds repos under the roots but not inside other repos or skip dirs', async () => {
    const repos = await discoverRepos([root]);
    const names = repos.map((r) => r.name);
    expect(names).toContain('repo-a');
    expect(names).toContain('repo-b');
    expect(names).toContain('nested-repo');
    expect(names).not.toContain('inner');
    expect(names).not.toContain('skipme-repo');
  });

  it('respects the depth bound', async () => {
    // repo-a lives at depth 2 (root/code/repo-a), nested-repo at depth 3
    const repos = await discoverRepos([root], { maxDepth: 2 });
    const names = repos.map((r) => r.name);
    expect(names).toContain('repo-a');
    expect(names).not.toContain('nested-repo');
  });

  it('caps the number of repos returned', async () => {
    const repos = await discoverRepos([root], { maxRepos: 1 });
    expect(repos.length).toBe(1);
  });

  it('ignores nonexistent roots instead of failing', async () => {
    const repos = await discoverRepos([path.join(root, 'missing'), root]);
    expect(repos.length).toBeGreaterThan(0);
  });
});
