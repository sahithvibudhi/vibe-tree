# E2E Scheduler Overlap 200ms Test - ACTUAL BUG DETECTED

## Test Name
`terminal-scheduler-overlap.spec.ts:276:7` - "should prevent corruption even with very short interval (200ms)"

## Error
```
Error: expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true

  354 |     // we should NOT see overlap due to concurrency protection
  355 |     console.log('Corrupted output detected:', hasCorruptedOutput);
> 356 |     expect(hasCorruptedOutput).toBe(false);
      |                                ^
```

## Root Cause
The test is correctly detecting that **the scheduler overlap bug still exists when using a 200ms repeat interval**.

The test verifies that with:
- Repeat interval: 200ms (very short)
- Command: `echo "This is a longer command to test overlap"` (44 chars)
- Expected typing time: ~44 * 10ms + 1000ms = ~1440ms total

The scheduler is starting new command executions every 200ms, but each execution takes 1440ms. This means:
- At 0ms: Command 1 starts
- At 200ms: Command 2 starts (Command 1 still typing)
- At 400ms: Command 3 starts (Commands 1 & 2 still typing)
- At 600ms: Command 4 starts (Commands 1, 2, & 3 still typing)
- ...and so on

**The concurrency protection is NOT working** - characters from different command executions are interleaving, creating corrupted terminal output.

## Test File Location
`apps/desktop/e2e/terminal-scheduler-overlap.spec.ts` line 276

## Investigation Needed
1. Review the concurrency protection implementation in `ClaudeTerminal.tsx`
2. Check if `commandInProgressRef` flag is actually preventing overlapping calls
3. Verify that chained `setTimeout` is working correctly
4. Check if the 200ms interval is somehow bypassing the protection
5. Look for race conditions in the scheduler logic

## Actual Symptoms
The test finds one or more of:
- `dquote>` prompt (unclosed quote from shell)
- Commands split across lines
- Split words (e.g., "longer  command")

This confirms characters from multiple sendScheduledCommand executions are interleaving.

## Critical Issue
This is a REAL BUG, not a test issue. The scheduler overlap fix does NOT work with very short intervals like 200ms. Tests 1 and 2 pass because they use longer intervals (500ms and 2000ms), but the 200ms test exposes that the fix is incomplete.

## Next Steps
1. Re-examine the scheduler implementation
2. Add stronger concurrency protection
3. Consider using a queue for scheduled commands
4. Test with various intervals to find the threshold where it breaks
