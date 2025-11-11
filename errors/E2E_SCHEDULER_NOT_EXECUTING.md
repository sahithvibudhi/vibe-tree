# E2E Scheduler Not Executing - REGRESSION FROM LOOP FIX

## Test Names
1. `terminal-scheduler-overlap.spec.ts:200:7` - "should show clean output when interval is longer than typing time"
2. `terminal-scheduler.spec.ts:179:7` - "should schedule repeating command and allow stopping"

## Error
```
Error: expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 2
Received:    0
```

Both tests expect at least 2 occurrences of output, but got 0. This means the scheduler is not executing commands at all!

## Root Cause
The while loop fix (commit b56879ea) introduced a regression. The loop checks:
```typescript
while (schedulerTimeoutRef.current) {
  await new Promise(resolve => {
    schedulerTimeoutRef.current = setTimeout(resolve, config.delayMs);
  });

  if (!schedulerTimeoutRef.current) {
    break;
  }

  await sendScheduledCommand(config.command);
}
```

**Problem 1**: The timeout promise REPLACES `schedulerTimeoutRef.current` with a timeout ID, not checks it
**Problem 2**: The loop condition check happens BEFORE each iteration, but the timeout is already running

The loop starts, sets a timeout, then immediately checks if `schedulerTimeoutRef.current` exists (it does - it's the timeout ID), but then when the timeout fires, it tries to execute commands but something prevents execution.

## Investigation Needed
1. Check if the while loop even starts
2. Check if timeouts are firing
3. Check why commands aren't executing
4. The loop approach may be fundamentally flawed - need a different strategy

## Previous Working Approach
The recursive `scheduleNext()` was actually closer to correct, but needed ONE fix:
- Don't call `scheduleNext()` after a command that was skipped (returned false)

## Better Fix Strategy
Instead of while loop, go back to recursive approach but:
1. Check return value of sendScheduledCommand
2. Only call scheduleNext() if command was actually executed OR if we want to retry
3. OR: Use the original recursive approach but ensure the delay happens AFTER command completion, not before
