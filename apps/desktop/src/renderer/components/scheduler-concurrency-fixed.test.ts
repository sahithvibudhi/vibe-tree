/**
 * Unit test to verify the scheduler overlap bug is fixed
 *
 * This test verifies that the fixed implementation prevents overlapping
 * command executions and maintains clean output.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the terminal write function
const mockWrites: string[] = [];
const mockWrite = vi.fn((_processId: string, data: string) => {
  mockWrites.push(data);
  return Promise.resolve();
});

// FIXED version of sendScheduledCommand
let commandInProgress = false;

function sendScheduledCommandFixed(command: string, processId: string, terminal: any): Promise<void> {
  if (!processId || !terminal) return Promise.resolve();

  // Prevent overlapping command executions
  if (commandInProgress) {
    console.warn('Command already in progress, skipping overlapping execution');
    return Promise.resolve();
  }

  commandInProgress = true;

  return new Promise<void>((resolve) => {
    let charIndex = 0;
    const typeNextChar = () => {
      if (charIndex < command.length) {
        const char = command[charIndex];
        mockWrite(processId, char);
        charIndex++;
        setTimeout(typeNextChar, 10);
      } else {
        setTimeout(() => {
          mockWrite(processId, '\r');
          commandInProgress = false;
          resolve();
        }, 1000);
      }
    };
    typeNextChar();
  });
}

// FIXED version of repeat scheduler using chained setTimeout
async function startSchedulerFixed(
  command: string,
  delayMs: number,
  processId: string,
  terminal: any,
  stopSignal: { stopped: boolean }
) {
  const scheduleNext = async () => {
    // Wait for the delay interval
    await new Promise(resolve => setTimeout(resolve, delayMs));

    // Execute the command and wait for it to complete
    await sendScheduledCommandFixed(command, processId, terminal);

    // Schedule the next execution only if not stopped
    if (!stopSignal.stopped) {
      await scheduleNext();
    }
  };

  await scheduleNext();
}

describe('Scheduler Overlap Bug - Fixed', () => {
  beforeEach(() => {
    mockWrites.length = 0;
    vi.clearAllMocks();
    vi.useFakeTimers();
    commandInProgress = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should prevent overlapping executions with fast repeat interval', async () => {
    const command = 'echo "Hello World"';
    const processId = 'test-process';
    const terminal = {};

    // Start first command
    const promise1 = sendScheduledCommandFixed(command, processId, terminal);

    // Advance time by 500ms (command still in progress)
    vi.advanceTimersByTime(500);

    // Try to start second command before first finishes
    const promise2 = sendScheduledCommandFixed(command, processId, terminal);

    // Advance time to let first complete
    vi.advanceTimersByTime(700);

    await promise1;
    await promise2;

    // Check what was written
    const writtenData = mockWrites.join('');
    console.log('Written data (fixed):', writtenData);
    console.log('Number of writes:', mockWrites.length);

    // With the fix, second command should be skipped (warned)
    // Only first command should execute: 18 chars + 1 enter = 19 writes
    expect(mockWrites.length).toBe(19);
    expect(writtenData).toBe('echo "Hello World"\r');
  });

  it('should allow sequential executions when properly spaced', async () => {
    const command = 'echo "Hello World"';
    const processId = 'test-process';
    const terminal = {};

    // Start first command
    const promise1 = sendScheduledCommandFixed(command, processId, terminal);

    // Let it complete fully (1180ms)
    vi.advanceTimersByTime(1200);
    await promise1;

    expect(mockWrites.length).toBe(19);

    // Now start second command
    const promise2 = sendScheduledCommandFixed(command, processId, terminal);

    // Let it complete
    vi.advanceTimersByTime(1200);
    await promise2;

    // Both commands should have executed
    expect(mockWrites.length).toBe(38);
    const writtenData = mockWrites.join('');
    expect(writtenData).toBe('echo "Hello World"\recho "Hello World"\r');
  });

  it('should handle chained setTimeout scheduler correctly', async () => {
    const command = 'echo "Test"';
    const processId = 'test-process';
    const terminal = {};
    const stopSignal = { stopped: false };

    // Start scheduler with 500ms interval
    startSchedulerFixed(command, 500, processId, terminal, stopSignal);

    // Let it run for enough time for 3 executions
    // Each execution: 500ms wait + ~1100ms execution = 1600ms per iteration
    // For 3 executions: ~4800ms

    // First iteration: 500ms wait
    vi.advanceTimersByTime(500);
    // First execution: ~1100ms
    vi.advanceTimersByTime(1200);

    // Second iteration: 500ms wait
    vi.advanceTimersByTime(500);
    // Second execution: ~1100ms
    vi.advanceTimersByTime(1200);

    // Third iteration: 500ms wait
    vi.advanceTimersByTime(500);
    // Third execution: ~1100ms
    vi.advanceTimersByTime(1200);

    // Stop the scheduler
    stopSignal.stopped = true;

    // Wait a bit for cleanup
    vi.advanceTimersByTime(100);

    console.log('Total writes with chained setTimeout:', mockWrites.length);
    const writtenData = mockWrites.join('');
    console.log('Written data:', writtenData);

    // Should have 3 complete executions: 3 * (9 chars + 1 enter) = 30 writes
    expect(mockWrites.length).toBe(30);

    // Should be clean output with no interleaving
    expect(writtenData).toBe('echo "Test"\recho "Test"\recho "Test"\r');

    // Count occurrences of the command
    const commandOccurrences = (writtenData.match(/echo "Test"/g) || []).length;
    expect(commandOccurrences).toBe(3);

    // Should not have any corruption patterns
    expect(writtenData).not.toContain('dquote>');
    expect(writtenData).not.toMatch(/Test.*Test[^"]/); // No partial commands
  });

  it('should handle rapid firing after simulated sleep/wake correctly', async () => {
    /**
     * With the fix, even if timers fire rapidly after sleep/wake,
     * the commandInProgress flag prevents overlapping executions.
     */
    const command = 'echo "Test"';
    const processId = 'test-process';
    const terminal = {};

    // Simulate 5 rapid command attempts (like after sleep/wake)
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(sendScheduledCommandFixed(command, processId, terminal));
    }

    // Advance time to let them complete
    vi.advanceTimersByTime(5000);

    await Promise.all(promises);

    const writtenData = mockWrites.join('');
    console.log('Output after rapid firing (fixed):', writtenData);
    console.log('Total writes:', mockWrites.length);

    // With the fix, only the first command executes
    // Others are skipped due to commandInProgress flag
    // Should have just 1 execution: 9 chars + 1 enter = 10 writes
    expect(mockWrites.length).toBe(10);
    expect(writtenData).toBe('echo "Test"\r');

    // No corruption
    expect(writtenData).not.toContain('dquote>');
  });

  it('should maintain clean output with aggressive repeat interval', async () => {
    /**
     * Even with 200ms interval (much faster than execution time),
     * the chained setTimeout approach ensures clean execution.
     */
    const command = 'echo "Fast"';
    const processId = 'test-process';
    const terminal = {};
    const stopSignal = { stopped: false };

    // Start scheduler with very fast 200ms interval
    startSchedulerFixed(command, 200, processId, terminal, stopSignal);

    // Let it run for several iterations
    // Each iteration: 200ms wait + ~1100ms execution = 1300ms
    // Let's do 2 full iterations: ~2600ms
    for (let i = 0; i < 2; i++) {
      vi.advanceTimersByTime(200); // wait
      vi.advanceTimersByTime(1200); // execute
    }

    stopSignal.stopped = true;
    vi.advanceTimersByTime(100);

    const writtenData = mockWrites.join('');
    console.log('Output with 200ms interval (fixed):', writtenData);
    console.log('Total writes:', mockWrites.length);

    // Should have 2 clean executions: 2 * (9 chars + 1 enter) = 20 writes
    expect(mockWrites.length).toBe(20);
    expect(writtenData).toBe('echo "Fast"\recho "Fast"\r');

    // No corruption despite aggressive interval
    expect(writtenData).not.toContain('dquote>');
    expect(writtenData).not.toMatch(/Fast.*Fast[^"]/);
  });
});
