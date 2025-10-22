/**
 * TerminalController - Handles terminal lifecycle events in a testable way
 *
 * This follows MVC pattern where:
 * - View (TerminalGrid) emits events
 * - Controller (this class) handles business logic
 * - Model (ShellSessionManager via IPC) manages state
 */

export interface IShellAPI {
  terminate(processId: string): Promise<{ success: boolean; timedOut?: boolean }>;
  forceTerminate(processId: string): Promise<{ success: boolean }>;
}

export interface TerminalCloseEvent {
  terminalId: string;
  processId: string;
}

export class TerminalController {
  private shellAPI: IShellAPI;
  private onCleanupSuccess?: (terminalId: string) => void;
  private onCleanupError?: (terminalId: string, error: Error) => void;
  private onCleanupTimeout?: (terminalId: string, processId: string) => void;

  constructor(
    shellAPI: IShellAPI,
    callbacks?: {
      onCleanupSuccess?: (terminalId: string) => void;
      onCleanupError?: (terminalId: string, error: Error) => void;
      onCleanupTimeout?: (terminalId: string, processId: string) => void;
    }
  ) {
    this.shellAPI = shellAPI;
    this.onCleanupSuccess = callbacks?.onCleanupSuccess;
    this.onCleanupError = callbacks?.onCleanupError;
    this.onCleanupTimeout = callbacks?.onCleanupTimeout;
  }

  /**
   * Handle terminal close event - terminates PTY process gracefully
   * @param event - Terminal close event containing terminal and process IDs
   * @returns Promise that resolves when cleanup is complete, or rejects if timeout
   */
  async handleTerminalClose(event: TerminalCloseEvent): Promise<void> {
    const { terminalId, processId } = event;

    console.log(`[TerminalController] Closing terminal ${terminalId} with process ${processId}`);

    try {
      const result = await this.shellAPI.terminate(processId);

      if (result.timedOut) {
        // Process didn't exit gracefully - notify view to show force kill button
        console.log(`[TerminalController] PTY process ${processId} did not exit gracefully for terminal ${terminalId}`);
        this.onCleanupTimeout?.(terminalId, processId);
        throw new Error(`Process ${processId} did not exit within timeout`);
      }

      if (!result.success) {
        const error = new Error(`Failed to terminate PTY process ${processId}`);
        console.error(`[TerminalController] ${error.message}`);
        this.onCleanupError?.(terminalId, error);
        throw error;
      }

      console.log(`[TerminalController] Successfully terminated PTY process ${processId} for terminal ${terminalId}`);
      this.onCleanupSuccess?.(terminalId);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[TerminalController] Error terminating PTY process ${processId}:`, err);
      this.onCleanupError?.(terminalId, err);
      throw err;
    }
  }

  /**
   * Force kill a terminal's PTY process
   * @param event - Terminal close event containing terminal and process IDs
   * @returns Promise that resolves when force kill is complete
   */
  async handleForceTerminalClose(event: TerminalCloseEvent): Promise<void> {
    const { terminalId, processId } = event;

    console.log(`[TerminalController] Force killing terminal ${terminalId} with process ${processId}`);

    try {
      const result = await this.shellAPI.forceTerminate(processId);

      if (!result.success) {
        const error = new Error(`Failed to force kill PTY process ${processId}`);
        console.error(`[TerminalController] ${error.message}`);
        this.onCleanupError?.(terminalId, error);
        throw error;
      }

      console.log(`[TerminalController] Successfully force killed PTY process ${processId} for terminal ${terminalId}`);
      this.onCleanupSuccess?.(terminalId);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[TerminalController] Error force killing PTY process ${processId}:`, err);
      this.onCleanupError?.(terminalId, err);
      throw err;
    }
  }

  /**
   * Handle multiple terminal closes in batch
   * @param events - Array of terminal close events
   * @returns Promise that resolves when all cleanups are complete
   */
  async handleBatchTerminalClose(events: TerminalCloseEvent[]): Promise<void> {
    console.log(`[TerminalController] Batch closing ${events.length} terminals`);

    const results = await Promise.allSettled(
      events.map(event => this.handleTerminalClose(event))
    );

    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      console.error(`[TerminalController] ${failures.length} terminal(s) failed to close properly`);
      throw new Error(`Failed to close ${failures.length} terminal(s)`);
    }

    console.log(`[TerminalController] Successfully closed ${events.length} terminals`);
  }
}
