#!/usr/bin/env node
/**
 * Thin command-line client for a VibeTree server. Everything goes through
 * the same REST and WebSocket APIs the web app uses, so anything scripted
 * here behaves exactly like clicking the UI, and sessions started here
 * keep running server-side after the CLI exits.
 */
import WebSocket from 'ws';
import { WebSocketAdapter } from '@vibetree/core';

// The shared adapter targets the browser WebSocket global; ws is API
// compatible for the handler-property subset the adapter uses
(globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;

interface Flags {
  server: string;
  token?: string;
  project?: string;
  agent?: string;
  delaySeconds: number;
}

function parseArgs(argv: string[]): { positional: string[]; flags: Flags } {
  const flags: Flags = {
    server: process.env.VIBETREE_SERVER || 'http://localhost:3002',
    token: process.env.VIBETREE_TOKEN,
    delaySeconds: 4
  };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--server') flags.server = argv[++i];
    else if (arg === '--token') flags.token = argv[++i];
    else if (arg === '--project') flags.project = argv[++i];
    else if (arg === '--agent') flags.agent = argv[++i];
    else if (arg === '--delay') flags.delaySeconds = Number(argv[++i]) || 4;
    else positional.push(arg);
  }
  return { positional, flags };
}

function apiUrl(flags: Flags, path: string): string {
  return `${flags.server.replace(/\/$/, '')}${path}`;
}

async function api<T>(
  flags: Flags,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  const response = await fetch(apiUrl(flags, path), {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(flags.token ? { Authorization: `Bearer ${flags.token}` } : {})
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `${init.method ?? 'GET'} ${path} failed: HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function requireProject(flags: Flags): string {
  const project = flags.project || process.cwd();
  return project;
}

interface Worktree {
  path: string;
  branch?: string;
  head: string;
}

function branchName(worktree: Worktree): string {
  return worktree.branch ? worktree.branch.replace('refs/heads/', '') : worktree.head.slice(0, 8);
}

async function listWorktrees(flags: Flags): Promise<Worktree[]> {
  return api<Worktree[]>(flags, '/api/git/worktrees', {
    method: 'POST',
    body: { projectPath: requireProject(flags) }
  });
}

async function cmdWorktrees(sub: string, args: string[], flags: Flags): Promise<void> {
  if (sub === 'list' || !sub) {
    const worktrees = await listWorktrees(flags);
    worktrees.forEach((worktree) => {
      console.log(`${branchName(worktree).padEnd(30)} ${worktree.path}`);
    });
    return;
  }
  if (sub === 'add') {
    const branch = args[0];
    if (!branch) throw new Error('usage: vibetree worktrees add <branch> [--project <path>]');
    const result = await api<{ path: string; branch: string }>(flags, '/api/git/worktree/add', {
      method: 'POST',
      body: { projectPath: requireProject(flags), branchName: branch }
    });
    console.log(`created ${result.branch} at ${result.path}`);
    return;
  }
  if (sub === 'remove') {
    const branch = args[0];
    if (!branch) throw new Error('usage: vibetree worktrees remove <branch> [--project <path>]');
    const worktrees = await listWorktrees(flags);
    const target = worktrees.find((worktree) => branchName(worktree) === branch);
    if (!target) throw new Error(`no worktree for branch ${branch}`);
    const result = await api<{ success: boolean; warning?: string }>(flags, '/api/git/worktree', {
      method: 'DELETE',
      body: { projectPath: requireProject(flags), worktreePath: target.path, branchName: branch }
    });
    console.log(result.success ? `removed ${branch}` : 'remove failed');
    if (result.warning) console.warn(result.warning);
    return;
  }
  throw new Error(`unknown worktrees subcommand: ${sub}`);
}

async function cmdStatus(flags: Flags): Promise<void> {
  const [shells, states] = await Promise.all([
    api<Array<{ id: string; worktreePath: string }>>(flags, '/api/shells'),
    api<Record<string, { worktreePath: string; state: string }>>(flags, '/api/agent/states')
  ]);
  if (shells.length === 0) {
    console.log('no live sessions');
    return;
  }
  shells.forEach((shell) => {
    const state = states[shell.id]?.state ?? 'idle';
    const name = shell.worktreePath.split('/').filter(Boolean).pop() ?? shell.worktreePath;
    console.log(`${state.padEnd(12)} ${name.padEnd(30)} ${shell.id}`);
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function cmdRun(args: string[], flags: Flags): Promise<void> {
  const branch = args[0];
  const prompt = args[1];
  if (!branch) {
    throw new Error('usage: vibetree run <branch> ["prompt"] [--agent <cmd>] [--project <path>]');
  }

  const projectPath = requireProject(flags);

  let worktrees = await listWorktrees(flags);
  let target = worktrees.find((worktree) => branchName(worktree) === branch);
  if (!target) {
    console.log(`creating worktree for ${branch}...`);
    await api(flags, '/api/git/worktree/add', {
      method: 'POST',
      body: { projectPath, branchName: branch }
    });
    worktrees = await listWorktrees(flags);
    target = worktrees.find((worktree) => branchName(worktree) === branch);
  }
  if (!target) throw new Error(`worktree for ${branch} not found after creation`);

  let agentCommand = flags.agent;
  if (!agentCommand) {
    const config = await api<{ agentCommand?: string }>(
      flags,
      `/api/projects/config?path=${encodeURIComponent(projectPath)}`
    ).catch(() => ({}) as { agentCommand?: string });
    agentCommand = config.agentCommand;
  }

  const wsUrl = flags.server.replace(/^http/, 'ws');
  const adapter = new WebSocketAdapter(flags.token ? `${wsUrl}?token=${flags.token}` : wsUrl);
  await adapter.connect();

  const result = await adapter.startShell(target.path, 120, 30, false, 'cli');
  if (!result.success || !result.processId) {
    throw new Error(result.error || 'failed to start shell');
  }
  console.log(`session ${result.processId} on ${target.path}${result.isNew ? ' (new)' : ''}`);

  if (agentCommand && result.isNew) {
    console.log(`launching ${agentCommand}...`);
    await adapter.writeToShell(result.processId, `${agentCommand}\r`);
  }

  if (prompt) {
    // Give the agent CLI a moment to boot before the prompt lands
    if (agentCommand && result.isNew) await wait(flags.delaySeconds * 1000);
    await adapter.writeToShell(result.processId, `${prompt}\r`);
    console.log('prompt sent');
  }

  adapter.disconnect();
  console.log('session keeps running server-side; open it in the app to watch');
}

const USAGE = `vibetree - command-line client for a VibeTree server

usage:
  vibetree worktrees list                 list worktrees
  vibetree worktrees add <branch>         create a worktree
  vibetree worktrees remove <branch>      remove a worktree
  vibetree status                         live sessions and agent states
  vibetree run <branch> ["prompt"]        start (or reuse) a session, launch
                                          the preset agent, send the prompt

flags:
  --project <path>   project repository (default: cwd)
  --server <url>     server URL (default: $VIBETREE_SERVER or http://localhost:3002)
  --token <token>    auth token for servers with auth enabled ($VIBETREE_TOKEN)
  --agent <cmd>      override the project's agent command (run only)
  --delay <seconds>  boot delay before sending the prompt (default 4)
`;

async function main(): Promise<void> {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [command, sub, ...rest] = positional;

  switch (command) {
    case 'worktrees':
      await cmdWorktrees(sub, rest, flags);
      break;
    case 'status':
      await cmdStatus(flags);
      break;
    case 'run':
      await cmdRun([sub, ...rest], flags);
      break;
    default:
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
  }
}

main()
  .then(() => {
    // Keep-alive sockets (fetch, ws) would otherwise hold the process open
    process.exit(process.exitCode ?? 0);
  })
  .catch((error) => {
    console.error(`error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
