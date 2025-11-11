# Scheduler Overlap Bug Analysis

## Problem Description

When using the terminal scheduler with repeat mode and the machine becomes locked/sleeps, gibberish input is sent to the terminal. For example, setting `echo "Hello World"` to repeat every 1 second results in corrupted output like:

```
% echo "Hello World
dquote> "echo "Hello World"
Hello World
echo Hello World
...
% echo "Hello Wor
dquote> ld"echo "Hello World"
Hello Wor
ldecho Hello World
```

## Root Cause

The issue is in `apps/desktop/src/renderer/components/ClaudeTerminal.tsx:96-146`.

### The Vulnerable Code

```typescript
const sendScheduledCommand = useCallback((command: string) => {
  if (!processIdRef.current || !terminal) return;

  let charIndex = 0;
  const typeNextChar = () => {
    if (charIndex < command.length) {
      const char = command[charIndex];
      window.electronAPI.shell.write(processIdRef.current, char);
      charIndex++;
      setTimeout(typeNextChar, 10); // 10ms between characters
    } else {
      setTimeout(() => {
        window.electronAPI.shell.write(processIdRef.current, '\r');
      }, 1000);
    }
  };
  typeNextChar();
}, [terminal]);

const startScheduler = useCallback((config: SchedulerConfig) => {
  stopScheduler();
  setSchedulerConfig(config);
  setSchedulerRunning(true);

  if (config.repeat) {
    schedulerIntervalRef.current = setInterval(() => {
      sendScheduledCommand(config.command);
    }, config.delayMs);
  }
  // ...
}, [stopScheduler, sendScheduledCommand]);
```

### Why It Fails

1. **No Concurrency Protection**: `setInterval` fires every `delayMs` milliseconds, calling `sendScheduledCommand` immediately without checking if the previous command is still being typed.

2. **Long Execution Time**: Each command takes time to complete:
   - Character typing: ~10ms × command.length
   - Wait before Enter: +1000ms
   - For `echo "Hello World"` (18 chars): ~180ms + 1000ms = **1180ms total**

3. **Race Condition**: If the repeat interval (e.g., 1000ms) is shorter than the execution time (1180ms), or even close to it, the next command starts before the previous one finishes.

4. **Character Interleaving**: Multiple concurrent `typeNextChar` recursions run simultaneously:
   - Command 1 typing: `e`, `c`, `h`, `o`...
   - Command 2 starts typing: `e`, `c`, `h`, `o`...
   - Result: `eecchhoo...` (gibberish)

5. **Sleep/Wake Amplifies the Problem**:
   - When macOS sleeps, `setInterval` and `setTimeout` are paused
   - On wake, they may fire rapidly or all at once to "catch up"
   - Multiple command executions start simultaneously
   - Massive character interleaving creates severe corruption

### Visual Timeline

```
Time    | Action
--------|-------------------------------------------------------
0ms     | Interval fires → Command 1 starts typing 'e'
10ms    | Command 1 types 'c'
20ms    | Command 1 types 'h'
...
1000ms  | Interval fires → Command 2 starts typing 'e' (overlap!)
1010ms  | Command 1 types next char, Command 2 types 'c' (chaos!)
1180ms  | Command 1 sends Enter
1200ms  | Command 1 types next char...
```

## Tests Created

### 1. Unit Test: `scheduler-concurrency.test.ts`

Location: `apps/desktop/src/renderer/components/scheduler-concurrency.test.ts`

This test directly exposes the overlap issue with fake timers:

```bash
pnpm test scheduler-concurrency.test.ts
```

**Results**: Demonstrates character interleaving when commands overlap.

### 2. E2E Test: `terminal-scheduler-overlap.spec.ts`

Location: `apps/desktop/e2e/terminal-scheduler-overlap.spec.ts`

This test runs in actual Electron environment and verifies:
- Fast repeat intervals (500ms) cause corrupted output
- Slow repeat intervals (2000ms) work correctly
- Detection of corruption patterns (dquote>, split words, split commands)

```bash
cd apps/desktop && pnpm test:e2e terminal-scheduler-overlap.spec.ts
```

## Impact

- **Severity**: High - Corrupts terminal input, can break interactive applications
- **Frequency**: Occurs when:
  - Repeat interval ≤ command execution time
  - Machine sleeps/wakes during repeat mode
  - User sets very fast repeat intervals

## Solution Requirements

The fix must:
1. Prevent overlapping command executions
2. Queue commands if they arrive while one is executing
3. Handle sleep/wake gracefully
4. Maintain the character-by-character typing behavior (required for raw terminal mode)
5. Not drop commands (queue them instead)

## Proposed Fix

Add a mutex/lock mechanism to `sendScheduledCommand`:

```typescript
const commandInProgressRef = useRef(false);
const commandQueueRef = useRef<string[]>([]);

const sendScheduledCommand = useCallback(async (command: string) => {
  if (!processIdRef.current || !terminal) return;

  // If a command is already in progress, queue this one
  if (commandInProgressRef.current) {
    commandQueueRef.current.push(command);
    return;
  }

  commandInProgressRef.current = true;

  try {
    // Type the command
    for (let i = 0; i < command.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      window.electronAPI.shell.write(processIdRef.current, command[i]);
    }

    // Wait before Enter
    await new Promise(resolve => setTimeout(resolve, 1000));
    window.electronAPI.shell.write(processIdRef.current, '\r');
  } finally {
    commandInProgressRef.current = false;

    // Process queued commands
    if (commandQueueRef.current.length > 0) {
      const nextCommand = commandQueueRef.current.shift()!;
      sendScheduledCommand(nextCommand);
    }
  }
}, [terminal]);
```

Or simpler approach: **Only allow next interval if previous command finished**:

```typescript
const startScheduler = useCallback((config: SchedulerConfig) => {
  stopScheduler();
  setSchedulerConfig(config);
  setSchedulerRunning(true);

  const executeWithDelay = () => {
    if (config.repeat) {
      schedulerTimeoutRef.current = setTimeout(async () => {
        await sendScheduledCommand(config.command);
        executeWithDelay(); // Schedule next after completion
      }, config.delayMs);
    }
  };

  executeWithDelay();
}, [stopScheduler, sendScheduledCommand]);
```

This changes from `setInterval` (fires regardless of completion) to chained `setTimeout` (only fires after previous completes).

## Files Affected

- `apps/desktop/src/renderer/components/ClaudeTerminal.tsx` - Main fix location
- `apps/desktop/src/renderer/components/scheduler-concurrency.test.ts` - Unit test
- `apps/desktop/e2e/terminal-scheduler-overlap.spec.ts` - E2E test
