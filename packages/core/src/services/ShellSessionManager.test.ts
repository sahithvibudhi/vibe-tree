import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ShellSessionManager } from './ShellSessionManager';
import type { IPty } from '../utils/shell';

// Mock IPty interface
interface MockIPty extends IPty {
  killed: boolean;
  exitCode?: number;
  onDataCallback?: (data: string) => void;
  onExitCallback?: (code: number) => void;
}

// Helper to create a mock PTY process
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
    write: (data: string) => {
      // Simulate writing data
    },
    resize: (cols: number, rows: number) => {
      mockPty.cols = cols;
      mockPty.rows = rows;
    },
    kill: (signal?: string) => {
      mockPty.killed = true;
      // Simulate exit callback
      if (mockPty.onExitCallback) {
        mockPty.onExitCallback(0);
      }
    },
    clear: () => {
      // Mock clear
    },
    pause: () => {
      // Mock pause
    },
    resume: () => {
      // Mock resume
    }
  };
  return mockPty;
}

describe('ShellSessionManager', () => {
  let manager: ShellSessionManager;

  beforeEach(async () => {
    // Get a fresh instance for each test
    manager = ShellSessionManager.getInstance();
    // Clean up any existing sessions
    await manager.cleanup();
  });

  afterEach(async () => {
    // Clean up after each test
    await manager.cleanup();
  });

  describe('terminateSessionsForWorktree', () => {
    it('should kill all PTY processes for a specific worktree path', async () => {
      const worktreePath1 = '/path/to/worktree1';
      const worktreePath2 = '/path/to/worktree2';

      // Create mock PTY processes
      const mockPty1a = createMockPty();
      const mockPty1b = createMockPty();
      const mockPty2 = createMockPty();

      // Create a spawn function that returns our mock PTYs
      const mockSpawnFn = vi.fn()
        .mockReturnValueOnce(mockPty1a)
        .mockReturnValueOnce(mockPty1b)
        .mockReturnValueOnce(mockPty2);

      // Start multiple sessions for worktree1
      await manager.startSession(worktreePath1, 80, 30, mockSpawnFn, true, 'terminal-1');
      await manager.startSession(worktreePath1, 80, 30, mockSpawnFn, true, 'terminal-2');

      // Start one session for worktree2
      await manager.startSession(worktreePath2, 80, 30, mockSpawnFn, true, 'terminal-1');

      // Verify all sessions are created
      expect(manager.getAllSessions().length).toBe(3);

      // Terminate all sessions for worktree1
      const terminatedCount = await manager.terminateSessionsForWorktree(worktreePath1);

      // Verify that 2 sessions were terminated
      expect(terminatedCount).toBe(2);

      // Verify that the PTY processes were killed
      expect(mockPty1a.killed).toBe(true);
      expect(mockPty1b.killed).toBe(true);

      // Verify that worktree2's session is still active
      expect(mockPty2.killed).toBe(false);
      expect(manager.getAllSessions().length).toBe(1);

      // Verify the remaining session is for worktree2
      const remainingSessions = manager.getAllSessions();
      expect(remainingSessions[0].worktreePath).toBe(worktreePath2);
    });

    it('should return 0 when no sessions exist for the worktree', async () => {
      const worktreePath = '/path/to/nonexistent/worktree';

      // Try to terminate sessions for a worktree with no sessions
      const terminatedCount = await manager.terminateSessionsForWorktree(worktreePath);

      // Should return 0
      expect(terminatedCount).toBe(0);
    });

    it('should handle multiple sessions with the same worktree path', async () => {
      const worktreePath = '/path/to/worktree';

      // Create 5 mock PTY processes
      const mockPtys = Array.from({ length: 5 }, () => createMockPty());

      const mockSpawnFn = vi.fn();
      mockPtys.forEach(pty => {
        mockSpawnFn.mockReturnValueOnce(pty);
      });

      // Start 5 sessions for the same worktree (with different terminal IDs)
      for (let i = 0; i < 5; i++) {
        await manager.startSession(
          worktreePath,
          80,
          30,
          mockSpawnFn,
          true,
          `terminal-${i}`
        );
      }

      // Verify all sessions are created
      expect(manager.getAllSessions().length).toBe(5);

      // Terminate all sessions for this worktree
      const terminatedCount = await manager.terminateSessionsForWorktree(worktreePath);

      // Verify all 5 sessions were terminated
      expect(terminatedCount).toBe(5);

      // Verify all PTY processes were killed
      mockPtys.forEach(pty => {
        expect(pty.killed).toBe(true);
      });

      // Verify no sessions remain
      expect(manager.getAllSessions().length).toBe(0);
    });

    it('should clean up listeners and disposables when terminating sessions', async () => {
      const worktreePath = '/path/to/worktree';
      const mockPty = createMockPty();

      const mockSpawnFn = vi.fn().mockReturnValue(mockPty);

      // Start a session
      const result = await manager.startSession(
        worktreePath,
        80,
        30,
        mockSpawnFn,
        true,
        'terminal-1'
      );

      // Add listeners to the session
      const outputCallback = vi.fn();
      const exitCallback = vi.fn();

      manager.addOutputListener(result.processId!, 'listener-1', outputCallback);
      manager.addExitListener(result.processId!, 'listener-1', exitCallback);

      // Simulate some PTY data
      if (mockPty.onDataCallback) {
        mockPty.onDataCallback('test data');
      }

      // Verify listener was called
      expect(outputCallback).toHaveBeenCalledWith('test data');

      // Terminate sessions for this worktree
      const terminatedCount = await manager.terminateSessionsForWorktree(worktreePath);

      expect(terminatedCount).toBe(1);

      // Verify PTY was killed
      expect(mockPty.killed).toBe(true);

      // Verify session was removed
      expect(manager.hasSession(result.processId!)).toBe(false);

      // Try to send more data - listener should not be called again
      outputCallback.mockClear();
      if (mockPty.onDataCallback) {
        mockPty.onDataCallback('more data');
      }

      expect(outputCallback).not.toHaveBeenCalled();
    });

    it('should not affect sessions from other worktrees when terminating', async () => {
      const worktreePath1 = '/path/to/worktree1';
      const worktreePath2 = '/path/to/worktree2';
      const worktreePath3 = '/path/to/worktree3';

      // Create mock PTY processes
      const mockPty1 = createMockPty();
      const mockPty2 = createMockPty();
      const mockPty3 = createMockPty();

      const mockSpawnFn = vi.fn()
        .mockReturnValueOnce(mockPty1)
        .mockReturnValueOnce(mockPty2)
        .mockReturnValueOnce(mockPty3);

      // Start sessions for different worktrees
      const session1 = await manager.startSession(worktreePath1, 80, 30, mockSpawnFn, true);
      const session2 = await manager.startSession(worktreePath2, 80, 30, mockSpawnFn, true);
      const session3 = await manager.startSession(worktreePath3, 80, 30, mockSpawnFn, true);

      // Terminate sessions for worktree2
      const terminatedCount = await manager.terminateSessionsForWorktree(worktreePath2);

      expect(terminatedCount).toBe(1);

      // Verify only mockPty2 was killed
      expect(mockPty1.killed).toBe(false);
      expect(mockPty2.killed).toBe(true);
      expect(mockPty3.killed).toBe(false);

      // Verify worktree1 and worktree3 sessions still exist
      expect(manager.hasSession(session1.processId!)).toBe(true);
      expect(manager.hasSession(session2.processId!)).toBe(false);
      expect(manager.hasSession(session3.processId!)).toBe(true);

      // Verify correct number of remaining sessions
      expect(manager.getAllSessions().length).toBe(2);
    });

    it('should handle case where worktree path is empty string', async () => {
      const terminatedCount = await manager.terminateSessionsForWorktree('');

      expect(terminatedCount).toBe(0);
    });

    it('should handle exact path matching (no partial matches)', async () => {
      const worktreePath1 = '/path/to/worktree';
      const worktreePath2 = '/path/to/worktree/subfolder';

      const mockPty1 = createMockPty();
      const mockPty2 = createMockPty();

      const mockSpawnFn = vi.fn()
        .mockReturnValueOnce(mockPty1)
        .mockReturnValueOnce(mockPty2);

      // Start sessions
      await manager.startSession(worktreePath1, 80, 30, mockSpawnFn, true);
      await manager.startSession(worktreePath2, 80, 30, mockSpawnFn, true);

      // Terminate sessions for worktreePath1 (should not affect worktreePath2)
      const terminatedCount = await manager.terminateSessionsForWorktree(worktreePath1);

      expect(terminatedCount).toBe(1);
      expect(mockPty1.killed).toBe(true);
      expect(mockPty2.killed).toBe(false);

      // Verify only one session remains
      expect(manager.getAllSessions().length).toBe(1);
      expect(manager.getAllSessions()[0].worktreePath).toBe(worktreePath2);
    });
  });

  describe('cleanup', () => {
    it('should terminate all sessions regardless of worktree', async () => {
      const worktreePath1 = '/path/to/worktree1';
      const worktreePath2 = '/path/to/worktree2';

      const mockPty1 = createMockPty();
      const mockPty2 = createMockPty();

      const mockSpawnFn = vi.fn()
        .mockReturnValueOnce(mockPty1)
        .mockReturnValueOnce(mockPty2);

      // Start sessions for different worktrees
      await manager.startSession(worktreePath1, 80, 30, mockSpawnFn, true);
      await manager.startSession(worktreePath2, 80, 30, mockSpawnFn, true);

      expect(manager.getAllSessions().length).toBe(2);

      // Cleanup all sessions
      await manager.cleanup();

      // Verify all PTY processes were killed
      expect(mockPty1.killed).toBe(true);
      expect(mockPty2.killed).toBe(true);

      // Verify no sessions remain
      expect(manager.getAllSessions().length).toBe(0);
    });
  });

  describe('terminateSession race condition fixes', () => {
    it('should return success when terminating a non-existent session', async () => {
      const nonExistentSessionId = 'does-not-exist';

      // Try to terminate a session that doesn't exist
      const result = await manager.terminateSession(nonExistentSessionId);

      // Should return success (not an error) since the goal is achieved - session is gone
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should handle PTY natural exit before manual termination', async () => {
      const worktreePath = '/path/to/worktree';
      const mockPty = createMockPty();

      const mockSpawnFn = vi.fn().mockReturnValue(mockPty);

      // Start a session
      const startResult = await manager.startSession(
        worktreePath,
        80,
        30,
        mockSpawnFn,
        true,
        'terminal-1'
      );

      expect(startResult.success).toBe(true);
      const sessionId = startResult.processId!;

      // Verify session exists
      expect(manager.hasSession(sessionId)).toBe(true);

      // Simulate PTY natural exit (e.g., command completion or crash)
      if (mockPty.onExitCallback) {
        mockPty.onExitCallback(0);
      }

      // Wait a tick for the exit handler to process
      await new Promise(resolve => setTimeout(resolve, 10));

      // Session should be removed after natural exit
      expect(manager.hasSession(sessionId)).toBe(false);

      // Now try to terminate manually (user clicks close button)
      const terminateResult = await manager.terminateSession(sessionId);

      // Should succeed even though session is already gone
      expect(terminateResult.success).toBe(true);
      expect(terminateResult.error).toBeUndefined();
    });

    it('should prevent double-termination of the same session', async () => {
      const worktreePath = '/path/to/worktree';
      const mockPty = createMockPty();

      const mockSpawnFn = vi.fn().mockReturnValue(mockPty);

      // Start a session
      const startResult = await manager.startSession(
        worktreePath,
        80,
        30,
        mockSpawnFn,
        true,
        'terminal-1'
      );

      expect(startResult.success).toBe(true);
      const sessionId = startResult.processId!;

      // Attempt to terminate the session twice in parallel
      const [result1, result2] = await Promise.all([
        manager.terminateSession(sessionId),
        manager.terminateSession(sessionId)
      ]);

      // Both should succeed
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Session should be gone
      expect(manager.hasSession(sessionId)).toBe(false);

      // PTY should have been killed only once
      expect(mockPty.killed).toBe(true);
    });

    it('should handle concurrent termination attempts gracefully', async () => {
      const worktreePath = '/path/to/worktree';
      const mockPty = createMockPty();

      const mockSpawnFn = vi.fn().mockReturnValue(mockPty);

      // Start a session
      const startResult = await manager.startSession(
        worktreePath,
        80,
        30,
        mockSpawnFn,
        true,
        'terminal-1'
      );

      expect(startResult.success).toBe(true);
      const sessionId = startResult.processId!;

      // Make the kill method slow to simulate a long termination
      const originalKill = mockPty.kill.bind(mockPty);
      mockPty.kill = (signal?: string) => {
        // Add a small delay to simulate slow termination
        setTimeout(() => originalKill(signal), 10);
      };

      // Attempt to terminate the session multiple times rapidly
      const terminatePromises = [
        manager.terminateSession(sessionId),
        manager.terminateSession(sessionId),
        manager.terminateSession(sessionId)
      ];

      // All should succeed due to state tracking
      const results = await Promise.all(terminatePromises);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // Session should be gone
      expect(manager.hasSession(sessionId)).toBe(false);
    });
  });
});
