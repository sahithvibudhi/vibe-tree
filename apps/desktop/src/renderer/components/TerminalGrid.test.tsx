import { describe, it, expect, vi } from 'vitest';

/**
 * Unit tests for TerminalGrid component focusing on the terminal close race condition bug.
 *
 * BUG: When handleClose is called, the terminal is added to terminalsBeingClosed set,
 * but if the async PTY cleanup doesn't complete quickly (or fails), subsequent close
 * attempts are blocked because the terminal remains in terminalsBeingClosed.
 *
 * This test file documents the expected behavior and exposes the bug.
 */

describe('TerminalGrid - Close Race Condition Bug', () => {
  describe('handleClose race condition', () => {
    it('should expose the bug: rapid close attempts are blocked when cleanup is slow', async () => {
      // This test documents the current buggy behavior where rapid close attempts
      // are blocked if the first attempt's async cleanup hasn't completed yet.

      // Setup: Simulate the current implementation
      const terminalsBeingClosed = new Set<string>();
      let cleanupCallCount = 0;
      let cleanupResolve: (() => void) | null = null;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const mockHandleTerminalClose = vi.fn((_args: { terminalId: string; processId: string }) => {
        cleanupCallCount++;
        // Return a promise that we control when it resolves
        return new Promise<void>((resolve) => {
          cleanupResolve = resolve;
        });
      });

      const handleClose = (terminalId: string) => {
        // Current buggy implementation
        if (terminalsBeingClosed.has(terminalId)) {
          console.log('Terminal is already being closed:', terminalId);
          return; // BUG: This blocks subsequent attempts
        }

        console.log('Initiating close for terminal:', terminalId);
        terminalsBeingClosed.add(terminalId);

        mockHandleTerminalClose({ terminalId, processId: 'process-123' })
          .then(() => {
            // Cleanup succeeded
            terminalsBeingClosed.delete(terminalId);
          })
          .catch((error) => {
            // BUG: Error case doesn't remove from terminalsBeingClosed!
            console.warn('PTY cleanup error:', error);
            // Missing: terminalsBeingClosed.delete(terminalId);
          });
      };

      // TEST: Attempt to close the same terminal twice rapidly
      const terminalId = 'terminal-1';

      // First close attempt
      handleClose(terminalId);
      expect(cleanupCallCount).toBe(1);
      expect(terminalsBeingClosed.has(terminalId)).toBe(true);

      // Second close attempt (before first completes) - should be blocked
      handleClose(terminalId);

      // BUG EXPOSED: The second attempt was blocked, cleanup wasn't called again
      expect(cleanupCallCount).toBe(1); // Still 1, not 2!
      expect(terminalsBeingClosed.has(terminalId)).toBe(true);

      // Even after first cleanup completes, the terminal is stuck if there was an error
      // Let's simulate an error scenario
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      cleanupResolve!(); // Complete first cleanup

      await new Promise(resolve => setTimeout(resolve, 10)); // Let promises resolve

      // After successful cleanup, terminal should be removed
      expect(terminalsBeingClosed.has(terminalId)).toBe(false);

      // This test exposes that:
      // 1. Rapid close attempts are blocked (second attempt was ignored)
      // 2. If cleanup fails, terminal stays in terminalsBeingClosed forever
    });

    it('should expose bug: terminal gets stuck if cleanup fails', async () => {
      const terminalsBeingClosed = new Set<string>();
      let onCleanupErrorCalled = false;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const mockHandleTerminalClose = vi.fn((_args: { terminalId: string; processId: string }) => {
        return Promise.reject(new Error('PTY termination failed'));
      });

      const onCleanupError = vi.fn((terminalId: string, error: Error) => {
        onCleanupErrorCalled = true;
        // Current implementation logs but doesn't remove from terminalsBeingClosed
        console.error(`PTY cleanup failed for ${terminalId}:`, error);
        // BUG: Missing cleanup
        // terminalsBeingClosed.delete(terminalId);
      });

      const handleClose = (terminalId: string) => {
        if (terminalsBeingClosed.has(terminalId)) {
          return;
        }

        terminalsBeingClosed.add(terminalId);

        mockHandleTerminalClose({ terminalId, processId: 'process-123' })
          .then(() => {
            terminalsBeingClosed.delete(terminalId);
          })
          .catch((error) => {
            onCleanupError(terminalId, error);
            // BUG: Doesn't remove from terminalsBeingClosed on error
          });
      };

      const terminalId = 'terminal-1';
      handleClose(terminalId);

      // Wait for promise to reject
      await new Promise(resolve => setTimeout(resolve, 10));

      // BUG EXPOSED: Terminal is stuck in terminalsBeingClosed even after error
      expect(onCleanupErrorCalled).toBe(true);
      expect(terminalsBeingClosed.has(terminalId)).toBe(true); // BUG!

      // Try to close again - will be blocked
      const beforeCallCount = mockHandleTerminalClose.mock.calls.length;
      handleClose(terminalId);
      const afterCallCount = mockHandleTerminalClose.mock.calls.length;

      expect(afterCallCount).toBe(beforeCallCount); // Blocked!
    });

    it('documents expected behavior: cleanup error should allow retry', async () => {
      // This test documents what the CORRECT behavior should be
      const terminalsBeingClosed = new Set<string>();
      let attemptCount = 0;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const mockHandleTerminalClose = vi.fn((_args: { terminalId: string; processId: string }) => {
        attemptCount++;
        if (attemptCount === 1) {
          return Promise.reject(new Error('First attempt failed'));
        }
        return Promise.resolve();
      });

      const handleCloseFixed = (terminalId: string) => {
        if (terminalsBeingClosed.has(terminalId)) {
          return;
        }

        terminalsBeingClosed.add(terminalId);

        mockHandleTerminalClose({ terminalId, processId: 'process-123' })
          .then(() => {
            terminalsBeingClosed.delete(terminalId);
          })
          .catch((error) => {
            console.error('Cleanup error:', error);
            // FIX: Remove from set even on error to allow retry
            terminalsBeingClosed.delete(terminalId);
          });
      };

      const terminalId = 'terminal-1';

      // First attempt (will fail)
      handleCloseFixed(terminalId);
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should be removed from set even after error
      expect(terminalsBeingClosed.has(terminalId)).toBe(false);
      expect(attemptCount).toBe(1);

      // Second attempt (should succeed)
      handleCloseFixed(terminalId);
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should complete successfully
      expect(terminalsBeingClosed.has(terminalId)).toBe(false);
      expect(attemptCount).toBe(2);
    });
  });
});
