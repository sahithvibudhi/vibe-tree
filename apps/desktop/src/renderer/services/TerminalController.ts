/**
 * TerminalController - Handles terminal lifecycle events in a testable way
 *
 * This follows MVC pattern where:
 * - View (TerminalGrid) emits events
 * - Controller (this class) handles business logic
 * - Model (ShellSessionManager via IPC) manages state
 */

export interface IShellAPI {
  terminate(processId: string): Promise<{ success: boolean; error?: string }>;
}

export interface TerminalCloseEvent {
  terminalId: string;
  processId: string;
}

export class TerminalController {
  private shellAPI: IShellAPI;
  private onCleanupSuccess?: (terminalId: string) => void;
  private onCleanupError?: (terminalId: string, error: Error) => void;

  constructor(
    shellAPI: IShellAPI,
    callbacks?: {
      onCleanupSuccess?: (terminalId: string) => void;
      onCleanupError?: (terminalId: string, error: Error) => void;
    }
  ) {
    this.shellAPI = shellAPI;
    this.onCleanupSuccess = callbacks?.onCleanupSuccess;
    this.onCleanupError = callbacks?.onCleanupError;
  }

  /**
   * Handle terminal close event - terminates PTY process immediately with SIGKILL
   * @param event - Terminal close event containing terminal and process IDs
   * @returns Promise that resolves when cleanup is complete
   */
  async handleTerminalClose(event: TerminalCloseEvent): Promise<void> {
    const { terminalId, processId } = event;

    console.log(`[TerminalController] Closing terminal ${terminalId} with process ${processId}`);

    try {
      const result = await this.shellAPI.terminate(processId);

      if (!result.success) {
        // Include the specific error message from the API if available
        const errorMsg = result.error
          ? `Failed to terminate PTY process ${processId}: ${result.error}`
          : `Failed to terminate PTY process ${processId}`;
        const error = new Error(errorMsg);
        console.error(`[TerminalController] ${error.message}\n${error.stack}`);
        this.onCleanupError?.(terminalId, error);
        throw error;
      }

      console.log(`[TerminalController] Successfully terminated PTY process ${processId} for terminal ${terminalId}`);
      this.onCleanupSuccess?.(terminalId);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // Log the full error with stack trace for debugging
      console.error(`[TerminalController] Error terminating PTY process ${processId}:\n${err.stack || err.message}`);
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
