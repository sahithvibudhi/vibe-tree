import { useCallback, useRef, useEffect } from 'react';

/**
 * Simple hook for checking if Claude is running in a terminal.
 *
 * NOTE: All notification state detection and logic has been moved to the main process.
 * This hook is now just a utility for checking if Claude is the foreground process.
 */

export interface UseClaudeStateDetectorOptions {
  processId: string | null;
}

export interface UseClaudeStateDetectorResult {
  /** Check if Claude is currently running (on-demand, not polling) */
  checkIsClaudeRunning: () => Promise<boolean>;
}

/**
 * Hook to check if Claude Code CLI is running in a terminal.
 *
 * All notification logic (state detection, timing, deduplication) is now
 * handled in the main process (notification-manager.ts) to avoid
 * React lifecycle issues.
 */
export function useClaudeStateDetector(
  options: UseClaudeStateDetectorOptions
): UseClaudeStateDetectorResult {
  const { processId } = options;
  const processIdRef = useRef(processId);

  useEffect(() => { processIdRef.current = processId; }, [processId]);

  // On-demand check if Claude is running
  const checkIsClaudeRunning = useCallback(async (): Promise<boolean> => {
    if (!processIdRef.current) return false;

    try {
      const result = await window.electronAPI?.shell.getForegroundProcess(processIdRef.current);
      if (result?.command) {
        return result.command.toLowerCase().includes('claude');
      }
    } catch {
      // Ignore errors
    }
    return false;
  }, []);

  return {
    checkIsClaudeRunning,
  };
}
