/**
 * Terminal ID Generator
 *
 * Generates unique terminal IDs using a monotonically increasing counter.
 * This prevents ID collisions that can occur when using Date.now() for rapid terminal splits.
 *
 * Design for testability:
 * - Pure functions for ID generation
 * - Resettable counter for testing
 * - No side effects beyond counter increment
 */

let terminalCounter = 0;

/**
 * Generate a unique terminal ID
 * Format: {worktreePath}-{counter}
 *
 * @param worktreePath - The worktree path to associate with this terminal
 * @returns A unique terminal ID
 */
export function generateTerminalId(worktreePath: string): string {
  return `${worktreePath}-${terminalCounter++}`;
}

/**
 * Reset the terminal counter
 * Used for testing to ensure deterministic IDs
 */
export function resetTerminalCounter(): void {
  terminalCounter = 0;
}

/**
 * Get the current counter value
 * Used for testing and debugging
 */
export function getTerminalCounter(): number {
  return terminalCounter;
}
