import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ShellSessionManager } from './ShellSessionManager';
import type { IPty } from '../utils/shell';

interface MockIPty extends IPty {
  killed: boolean;
  onDataCallback?: (data: string) => void;
  onExitCallback?: (code: number) => void;
}

function createMockPty(): MockIPty {
  const mockPty: MockIPty = {
    killed: false,
    pid: Math.floor(Math.random() * 10000),
    cols: 80,
    rows: 30,
    process: 'bash',
    handleFlowControl: false,
    onData: (callback: (data: string) => void) => {
      mockPty.onDataCallback = callback;
      return { dispose: () => { mockPty.onDataCallback = undefined; } };
    },
    onExit: (callback: (code: { exitCode: number; signal?: number }) => void) => {
      mockPty.onExitCallback = (code: number) => callback({ exitCode: code });
      return { dispose: () => { mockPty.onExitCallback = undefined; } };
    },
    write: () => {},
    resize: () => {},
    kill: () => {
      mockPty.killed = true;
      if (mockPty.onExitCallback) {
        mockPty.onExitCallback(0);
      }
    },
    clear: () => {},
    pause: () => {},
    resume: () => {}
  };
  return mockPty;
}

describe('ShellSessionManager output buffering and replay', () => {
  let manager: ShellSessionManager;
  let mockPty: MockIPty;

  beforeEach(async () => {
    manager = ShellSessionManager.getInstance();
    await manager.cleanup();
    mockPty = createMockPty();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await manager.cleanup();
  });

  async function startSession(worktree = '/test/worktree'): Promise<string> {
    const result = await manager.startSession(worktree, 80, 30, () => mockPty);
    expect(result.success).toBe(true);
    return result.processId!;
  }

  it('replays buffered output to a listener attached after data arrived', async () => {
    const sessionId = await startSession();

    const firstListener = vi.fn();
    manager.addOutputListener(sessionId, 'listener-1', firstListener);
    mockPty.onDataCallback!('hello ');
    mockPty.onDataCallback!('world');
    manager.removeOutputListener(sessionId, 'listener-1');

    const replayed: string[] = [];
    manager.addOutputListener(sessionId, 'listener-2', (data) => replayed.push(data));

    // Replay is deferred so the terminal has time to mount
    expect(replayed).toEqual([]);
    vi.advanceTimersByTime(60);
    expect(replayed).toEqual(['hello world']);
  });

  it('skips replay when skipReplay is set', async () => {
    const sessionId = await startSession();

    manager.addOutputListener(sessionId, 'listener-1', vi.fn());
    mockPty.onDataCallback!('buffered data');
    manager.removeOutputListener(sessionId, 'listener-1');

    const received: string[] = [];
    manager.addOutputListener(sessionId, 'listener-2', (data) => received.push(data), true);
    vi.advanceTimersByTime(100);
    expect(received).toEqual([]);
  });

  it('trims the buffer to roughly the max size, dropping oldest chunks first', async () => {
    const sessionId = await startSession();

    manager.addOutputListener(sessionId, 'listener-1', vi.fn());
    // 3 chunks of 40KB = 120KB > 100KB cap, so the first chunk must be dropped
    const chunkA = 'a'.repeat(40000);
    const chunkB = 'b'.repeat(40000);
    const chunkC = 'c'.repeat(40000);
    mockPty.onDataCallback!(chunkA);
    mockPty.onDataCallback!(chunkB);
    mockPty.onDataCallback!(chunkC);
    manager.removeOutputListener(sessionId, 'listener-1');

    const replayed: string[] = [];
    manager.addOutputListener(sessionId, 'listener-2', (data) => replayed.push(data));
    vi.advanceTimersByTime(60);

    expect(replayed).toHaveLength(1);
    expect(replayed[0]).toBe(chunkB + chunkC);
  });

  it('reuses the same session for the same worktree and terminal id', async () => {
    const first = await manager.startSession('/test/wt', 80, 30, () => mockPty, false, 'term-1');
    const second = await manager.startSession('/test/wt', 80, 30, () => mockPty, false, 'term-1');
    expect(second.processId).toBe(first.processId);
    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(false);
  });

  it('creates distinct sessions for distinct terminal ids in the same worktree', async () => {
    const ptyA = createMockPty();
    const ptyB = createMockPty();
    const first = await manager.startSession('/test/wt', 80, 30, () => ptyA, false, 'term-1');
    const second = await manager.startSession('/test/wt', 80, 30, () => ptyB, false, 'term-2');
    expect(second.processId).not.toBe(first.processId);
    expect(second.isNew).toBe(true);
  });

  it('keeps the session alive when all listeners are removed', async () => {
    const sessionId = await startSession();
    manager.addOutputListener(sessionId, 'listener-1', vi.fn());
    manager.removeOutputListener(sessionId, 'listener-1');
    expect(manager.hasSession(sessionId)).toBe(true);
    expect(mockPty.killed).toBe(false);
  });
});
