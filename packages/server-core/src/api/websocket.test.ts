import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { IPty } from '@vibetree/core';
import { createVibeTreeServer, type VibeTreeServer } from '../server';
import type { ServerConfig } from '../config';

interface MockPty extends IPty {
  emitData: (data: string) => void;
  emitExit: (code: number) => void;
  written: string[];
  killed: boolean;
}

function createMockSpawn() {
  const ptys: MockPty[] = [];
  const spawn = (): IPty => {
    let dataCb: ((data: string) => void) | undefined;
    let exitCb: ((e: { exitCode: number }) => void) | undefined;
    const mock: MockPty = {
      pid: 1000 + ptys.length,
      cols: 80,
      rows: 30,
      process: 'mock-shell',
      handleFlowControl: false,
      written: [],
      killed: false,
      onData: (cb: (data: string) => void) => {
        dataCb = cb;
        return { dispose: () => (dataCb = undefined) };
      },
      onExit: (cb: (e: { exitCode: number; signal?: number }) => void) => {
        exitCb = cb;
        return { dispose: () => (exitCb = undefined) };
      },
      write: (data: string) => {
        mock.written.push(data);
        // Echo like a terminal would
        dataCb?.(data);
      },
      resize: (cols: number, rows: number) => {
        mock.cols = cols;
        mock.rows = rows;
      },
      kill: () => {
        mock.killed = true;
        exitCb?.({ exitCode: 0 });
      },
      clear: () => {},
      pause: () => {},
      resume: () => {},
      emitData: (data: string) => dataCb?.(data),
      emitExit: (code: number) => exitCb?.({ exitCode: code })
    };
    ptys.push(mock);
    return mock;
  };
  return { spawn, ptys };
}

function testConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    authRequired: false,
    jwtSecret: 'test-secret',
    projectPath: process.cwd(),
    defaultProjects: [],
    sessionIdleTimeoutMs: 0,
    allowInsecureLan: false,
    nodeEnv: 'test',
    ...overrides
  };
}

function connect(port: number, query = ''): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${query}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function request<T = any>(ws: WebSocket, type: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const onMessage = (raw: Buffer) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === id) {
        ws.off('message', onMessage);
        resolve(msg.payload);
      }
    };
    ws.on('message', onMessage);
    ws.send(JSON.stringify({ type, payload, id }));
    setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), 5000);
  });
}

function collectOutput(ws: WebSocket, sessionId: string): { text: () => string } {
  let text = '';
  ws.on('message', (raw: Buffer) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'shell:output' && msg.payload.sessionId === sessionId) {
      text += msg.payload.data;
    }
  });
  return { text: () => text };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('websocket API', () => {
  let server: VibeTreeServer;
  let port: number;
  let mock: ReturnType<typeof createMockSpawn>;
  let worktree: string;

  beforeEach(async () => {
    mock = createMockSpawn();
    worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'vibetree-ws-test-'));
    server = createVibeTreeServer({ config: testConfig(), spawn: mock.spawn });
    ({ port } = await server.listen());
  });

  afterEach(async () => {
    await server.close();
    fs.rmSync(worktree, { recursive: true, force: true });
  });

  it('starts a shell and forwards output', async () => {
    const ws = await connect(port);
    const start = await request(ws, 'shell:start', {
      worktreePath: worktree,
      cols: 80,
      rows: 24,
      terminalId: 't1'
    });
    expect(start.success).toBe(true);
    expect(start.isNew).toBe(true);

    const output = collectOutput(ws, start.processId);
    mock.ptys[0].emitData('hello from pty');
    await wait(50);
    expect(output.text()).toContain('hello from pty');
    ws.close();
  });

  it('keeps sessions alive across disconnect and replays the buffer on reattach', async () => {
    const ws1 = await connect(port);
    const start1 = await request(ws1, 'shell:start', {
      worktreePath: worktree,
      terminalId: 't1'
    });
    mock.ptys[0].emitData('output before disconnect');
    await wait(50);

    // Hard close simulates a page reload or network blip
    ws1.terminate();
    await wait(100);

    expect(mock.ptys[0].killed).toBe(false);

    const ws2 = await connect(port);
    const status = await request(ws2, 'shell:status', { sessionId: start1.processId });
    expect(status.running).toBe(true);

    const start2 = await request(ws2, 'shell:start', {
      worktreePath: worktree,
      terminalId: 't1'
    });
    expect(start2.processId).toBe(start1.processId);
    expect(start2.isNew).toBe(false);
    expect(start2.buffer).toContain('output before disconnect');

    // Output produced while nobody was connected is also in the buffer
    const buf = await request(ws2, 'shell:get-buffer', { sessionId: start1.processId });
    expect(buf.buffer).toContain('output before disconnect');
    ws2.close();
  });

  it('buffers output produced while no client is connected', async () => {
    const ws1 = await connect(port);
    const start = await request(ws1, 'shell:start', { worktreePath: worktree, terminalId: 't1' });
    ws1.terminate();
    await wait(100);

    mock.ptys[0].emitData('produced while offline');

    const ws2 = await connect(port);
    const buf = await request(ws2, 'shell:get-buffer', { sessionId: start.processId });
    expect(buf.buffer).toContain('produced while offline');
    ws2.close();
  });

  it('gives each terminalId its own session in the same worktree', async () => {
    const ws = await connect(port);
    const a = await request(ws, 'shell:start', { worktreePath: worktree, terminalId: 't1' });
    const b = await request(ws, 'shell:start', { worktreePath: worktree, terminalId: 't2' });
    expect(a.processId).not.toBe(b.processId);
    expect(mock.ptys).toHaveLength(2);
    ws.close();
  });

  it('terminates sessions explicitly and reports worktree counts', async () => {
    const ws = await connect(port);
    const start = await request(ws, 'shell:start', { worktreePath: worktree, terminalId: 't1' });

    const counts = await request(ws, 'shell:get-worktree-sessions', {});
    expect(counts[worktree]).toBe(1);

    const term = await request(ws, 'shell:terminate', { sessionId: start.processId });
    expect(term.success).toBe(true);
    expect(mock.ptys[0].killed).toBe(true);

    const status = await request(ws, 'shell:status', { sessionId: start.processId });
    expect(status.running).toBe(false);
    ws.close();
  });

  it('broadcasts sessions-changed to all clients', async () => {
    const ws1 = await connect(port);
    const ws2 = await connect(port);

    const events: Record<string, number>[] = [];
    ws2.on('message', (raw: Buffer) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'shell:sessions-changed') {
        events.push(msg.payload);
      }
    });

    await request(ws1, 'shell:start', { worktreePath: worktree, terminalId: 't1' });
    await wait(100);

    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1][worktree]).toBe(1);
    ws1.close();
    ws2.close();
  });

  it('writes reach the pty', async () => {
    const ws = await connect(port);
    const start = await request(ws, 'shell:start', { worktreePath: worktree, terminalId: 't1' });
    const write = await request(ws, 'shell:write', {
      sessionId: start.processId,
      data: 'echo hi\r'
    });
    expect(write.success).toBe(true);
    expect(mock.ptys[0].written).toContain('echo hi\r');
    ws.close();
  });
});

describe('websocket auth', () => {
  let server: VibeTreeServer;
  let port: number;

  afterEach(async () => {
    await server.close();
  });

  it('rejects unauthenticated messages when auth is required in production', async () => {
    const mock = createMockSpawn();
    server = createVibeTreeServer({
      config: testConfig({ authRequired: true, nodeEnv: 'production', username: 'u', password: 'p' }),
      spawn: mock.spawn
    });
    ({ port } = await server.listen());

    // Connection from localhost is closed with an auth error in production
    const messages: string[] = [];
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      ws.on('message', (raw: Buffer) => messages.push(raw.toString()));
      ws.on('close', () => resolve());
    });
    expect(messages.join('')).toContain('auth:error');
  });

  it('accepts a valid session token', async () => {
    const mock = createMockSpawn();
    server = createVibeTreeServer({
      config: testConfig({ authRequired: true, nodeEnv: 'production', username: 'u', password: 'p' }),
      spawn: mock.spawn
    });
    ({ port } = await server.listen());

    const login = server.authService.login('u', 'p');
    expect(login.success).toBe(true);

    const first = await new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}?session_token=${login.sessionToken}`);
      ws.on('message', (raw: Buffer) => {
        resolve(raw.toString());
        ws.close();
      });
      ws.on('error', reject);
    });
    expect(first).toContain('auth:success');
  });

  it('accepts the embedded static token', async () => {
    const mock = createMockSpawn();
    server = createVibeTreeServer({
      config: testConfig({
        authRequired: true,
        nodeEnv: 'production',
        staticToken: 'embedded-secret'
      }),
      spawn: mock.spawn
    });
    ({ port } = await server.listen());

    const first = await new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}?token=embedded-secret`);
      ws.on('message', (raw: Buffer) => {
        resolve(raw.toString());
        ws.close();
      });
      ws.on('error', reject);
    });
    expect(first).toContain('auth:success');
  });
});
