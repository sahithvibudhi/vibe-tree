import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TerminalController, IShellAPI, TerminalCloseEvent } from './TerminalController';

describe('TerminalController', () => {
  let mockShellAPI: IShellAPI;
  let controller: TerminalController;
  let onCleanupSuccess: ReturnType<typeof vi.fn>;
  let onCleanupError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockShellAPI = {
      terminate: vi.fn().mockResolvedValue({ success: true })
    };

    onCleanupSuccess = vi.fn();
    onCleanupError = vi.fn();

    controller = new TerminalController(mockShellAPI, {
      onCleanupSuccess,
      onCleanupError
    });
  });

  describe('handleTerminalClose', () => {
    it('should successfully terminate PTY process', async () => {
      const event: TerminalCloseEvent = {
        terminalId: 'terminal-1',
        processId: 'process-123'
      };

      await controller.handleTerminalClose(event);

      expect(mockShellAPI.terminate).toHaveBeenCalledWith('process-123');
      expect(onCleanupSuccess).toHaveBeenCalledWith('terminal-1');
      expect(onCleanupError).not.toHaveBeenCalled();
    });

    it('should call onCleanupError when termination fails', async () => {
      mockShellAPI.terminate = vi.fn().mockResolvedValue({ success: false });

      const event: TerminalCloseEvent = {
        terminalId: 'terminal-1',
        processId: 'process-123'
      };

      await expect(controller.handleTerminalClose(event)).rejects.toThrow(
        'Failed to terminate PTY process process-123'
      );

      expect(mockShellAPI.terminate).toHaveBeenCalledWith('process-123');
      expect(onCleanupError).toHaveBeenCalledWith(
        'terminal-1',
        expect.objectContaining({
          message: 'Failed to terminate PTY process process-123'
        })
      );
      expect(onCleanupSuccess).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('IPC communication failed');
      mockShellAPI.terminate = vi.fn().mockRejectedValue(apiError);

      const event: TerminalCloseEvent = {
        terminalId: 'terminal-1',
        processId: 'process-123'
      };

      await expect(controller.handleTerminalClose(event)).rejects.toThrow('IPC communication failed');

      expect(mockShellAPI.terminate).toHaveBeenCalledWith('process-123');
      expect(onCleanupError).toHaveBeenCalledWith('terminal-1', apiError);
      expect(onCleanupSuccess).not.toHaveBeenCalled();
    });

    it('should work without callbacks', async () => {
      const controllerWithoutCallbacks = new TerminalController(mockShellAPI);

      const event: TerminalCloseEvent = {
        terminalId: 'terminal-1',
        processId: 'process-123'
      };

      await expect(controllerWithoutCallbacks.handleTerminalClose(event)).resolves.toBeUndefined();
      expect(mockShellAPI.terminate).toHaveBeenCalledWith('process-123');
    });
  });

  describe('handleBatchTerminalClose', () => {
    it('should close multiple terminals successfully', async () => {
      const events: TerminalCloseEvent[] = [
        { terminalId: 'terminal-1', processId: 'process-1' },
        { terminalId: 'terminal-2', processId: 'process-2' },
        { terminalId: 'terminal-3', processId: 'process-3' }
      ];

      await controller.handleBatchTerminalClose(events);

      expect(mockShellAPI.terminate).toHaveBeenCalledTimes(3);
      expect(mockShellAPI.terminate).toHaveBeenCalledWith('process-1');
      expect(mockShellAPI.terminate).toHaveBeenCalledWith('process-2');
      expect(mockShellAPI.terminate).toHaveBeenCalledWith('process-3');
      expect(onCleanupSuccess).toHaveBeenCalledTimes(3);
    });

    it('should handle partial failures in batch close', async () => {
      const terminateResults = new Map([
        ['process-1', { success: true }],
        ['process-2', { success: false }], // This one will fail
        ['process-3', { success: true }]
      ]);

      mockShellAPI.terminate = vi.fn().mockImplementation((processId: string) => {
        return Promise.resolve(terminateResults.get(processId) || { success: true });
      });

      const events: TerminalCloseEvent[] = [
        { terminalId: 'terminal-1', processId: 'process-1' },
        { terminalId: 'terminal-2', processId: 'process-2' },
        { terminalId: 'terminal-3', processId: 'process-3' }
      ];

      await expect(controller.handleBatchTerminalClose(events)).rejects.toThrow(
        'Failed to close 1 terminal(s)'
      );

      expect(mockShellAPI.terminate).toHaveBeenCalledTimes(3);
      expect(onCleanupSuccess).toHaveBeenCalledTimes(2); // terminal-1 and terminal-3
      // onCleanupError is called once for the individual terminal failure
      expect(onCleanupError).toHaveBeenCalledWith('terminal-2', expect.any(Error));
    });

    it('should handle empty batch', async () => {
      await controller.handleBatchTerminalClose([]);

      expect(mockShellAPI.terminate).not.toHaveBeenCalled();
      expect(onCleanupSuccess).not.toHaveBeenCalled();
      expect(onCleanupError).not.toHaveBeenCalled();
    });

    it('should continue closing other terminals even if one fails', async () => {
      let callCount = 0;
      mockShellAPI.terminate = vi.fn().mockImplementation((processId: string) => {
        callCount++;
        // Fail all odd-numbered calls
        if (callCount % 2 === 1) {
          return Promise.reject(new Error(`Failed to terminate ${processId}`));
        }
        return Promise.resolve({ success: true });
      });

      const events: TerminalCloseEvent[] = [
        { terminalId: 'terminal-1', processId: 'process-1' },
        { terminalId: 'terminal-2', processId: 'process-2' },
        { terminalId: 'terminal-3', processId: 'process-3' },
        { terminalId: 'terminal-4', processId: 'process-4' }
      ];

      await expect(controller.handleBatchTerminalClose(events)).rejects.toThrow(
        'Failed to close 2 terminal(s)'
      );

      // All terminals should be attempted
      expect(mockShellAPI.terminate).toHaveBeenCalledTimes(4);
      // Only even-numbered ones succeeded
      expect(onCleanupSuccess).toHaveBeenCalledTimes(2);
      expect(onCleanupError).toHaveBeenCalledTimes(2);
    });
  });

  describe('real-world scenarios', () => {
    it('should handle rapid successive terminal closes', async () => {
      const events = Array.from({ length: 10 }, (_, i) => ({
        terminalId: `terminal-${i}`,
        processId: `process-${i}`
      }));

      // Simulate varying response times
      mockShellAPI.terminate = vi.fn().mockImplementation(() => {
        const delay = Math.random() * 100; // Random delay up to 100ms
        return new Promise(resolve => {
          setTimeout(() => resolve({ success: true }), delay);
        });
      });

      const startTime = Date.now();
      await controller.handleBatchTerminalClose(events);
      const duration = Date.now() - startTime;

      expect(mockShellAPI.terminate).toHaveBeenCalledTimes(10);
      expect(onCleanupSuccess).toHaveBeenCalledTimes(10);
      // Should complete in less than 200ms due to parallelization
      // (vs 500ms+ if sequential)
      expect(duration).toBeLessThan(200);
    });

    it('should handle terminal close during process hang', async () => {
      // Simulate a hanging process that takes a long time
      mockShellAPI.terminate = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve({ success: true }), 3000);
        });
      });

      const event: TerminalCloseEvent = {
        terminalId: 'terminal-1',
        processId: 'process-hanging'
      };

      // This should still complete (the timeout is handled by killPty in the backend)
      const promise = controller.handleTerminalClose(event);

      // Should not resolve immediately
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(onCleanupSuccess).not.toHaveBeenCalled();

      // Wait for completion
      await promise;
      expect(onCleanupSuccess).toHaveBeenCalledWith('terminal-1');
    }, 10000); // Increase timeout for this test
  });
});
