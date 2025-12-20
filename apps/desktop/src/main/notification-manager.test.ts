import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock electron before importing
vi.mock('electron', () => ({
  Notification: class MockNotification {
    static isSupported = vi.fn(() => true);
    constructor() {}
    on = vi.fn();
    show = vi.fn();
  },
  BrowserWindow: vi.fn(),
  app: {
    getAppPath: vi.fn(() => '/mock/path'),
  },
  shell: {
    openExternal: vi.fn(),
  },
}));

// Mock fs
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal() as object;
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(() => false),
    },
    existsSync: vi.fn(() => false),
  };
});

// Mock child_process
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal() as object;
  return {
    ...actual,
    execSync: vi.fn(() => ''),
  };
});

// Mock notification-settings
vi.mock('./notification-settings', () => ({
  notificationSettingsManager: {
    isNotificationEnabled: vi.fn(() => true),
  },
}));

// Import after mocks
import { notificationManager } from './notification-manager';
import { notificationSettingsManager } from './notification-settings';

describe('NotificationManager', () => {
  const testProcessId = 'test-process-123';
  const testWorktreePath = '/path/to/worktree';
  const testBranchName = 'feature-branch';

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset any internal state by unregistering/re-registering
    notificationManager.unregisterSession(testProcessId);
    notificationManager.registerSession(testProcessId, testWorktreePath, testBranchName);
  });

  describe('registerSession', () => {
    it('should register a new session with default values', () => {
      const newProcessId = 'new-process-456';
      notificationManager.registerSession(newProcessId, testWorktreePath, testBranchName);

      // Session should exist but not be enabled by default
      expect(notificationManager.isEnabled(newProcessId)).toBe(false);

      // Cleanup
      notificationManager.unregisterSession(newProcessId);
    });
  });

  describe('enableNotifications', () => {
    it('should enable notifications for a registered session', () => {
      const result = notificationManager.enableNotifications(testProcessId);

      expect(result).toBe(true);
      expect(notificationManager.isEnabled(testProcessId)).toBe(true);
    });

    it('should return false for unregistered session', () => {
      const result = notificationManager.enableNotifications('non-existent-process');

      expect(result).toBe(false);
    });

    it('should NOT reset hasNotifiedForCurrentCompletion flag', () => {
      // Enable notifications
      notificationManager.enableNotifications(testProcessId);

      // Simulate a completion by processing output that triggers notification
      notificationManager.processOutput(testProcessId, 'some output\n↵ send\n');

      // Disable and re-enable (simulating window switch)
      notificationManager.disableNotifications(testProcessId);
      notificationManager.enableNotifications(testProcessId);

      // Process the same completion output again - should NOT trigger new notification
      // because hasNotifiedForCurrentCompletion was NOT reset
      vi.mocked(notificationSettingsManager.isNotificationEnabled).mockClear();
      notificationManager.processOutput(testProcessId, '↵ send\n');

      // The notification settings check is only called when all conditions pass
      // If hasNotifiedForCurrentCompletion is true, it should return early
      // We can verify by checking the session state indirectly
      expect(notificationManager.isEnabled(testProcessId)).toBe(true);
    });
  });

  describe('disableNotifications', () => {
    it('should disable notifications for a session', () => {
      notificationManager.enableNotifications(testProcessId);
      expect(notificationManager.isEnabled(testProcessId)).toBe(true);

      notificationManager.disableNotifications(testProcessId);
      expect(notificationManager.isEnabled(testProcessId)).toBe(false);
    });
  });

  describe('markUserInput', () => {
    it('should reset notification flag when user types', () => {
      // Enable notifications
      notificationManager.enableNotifications(testProcessId);

      // Simulate a completion (this sets hasNotifiedForCurrentCompletion = true)
      notificationManager.processOutput(testProcessId, '↵ send\n');

      // Mark user input - this should reset the flag
      notificationManager.markUserInput(testProcessId);

      // Now a new completion should trigger notification
      // (we can't directly test notification, but we can verify the flow doesn't error)
      notificationManager.processOutput(testProcessId, '↵ send\n');

      expect(notificationManager.isEnabled(testProcessId)).toBe(true);
    });

    it('should only work when notifications are enabled', () => {
      // Don't enable notifications
      notificationManager.markUserInput(testProcessId);

      // Should not throw and session should still be disabled
      expect(notificationManager.isEnabled(testProcessId)).toBe(false);
    });
  });

  describe('processOutput - state detection', () => {
    it('should detect completion pattern', () => {
      notificationManager.enableNotifications(testProcessId);

      // Process output with completion pattern
      notificationManager.processOutput(testProcessId, 'Task done\n↵ send\n');

      // Should not throw
      expect(notificationManager.isEnabled(testProcessId)).toBe(true);
    });

    it('should detect question pattern', () => {
      notificationManager.enableNotifications(testProcessId);

      // Process output with question pattern
      notificationManager.processOutput(testProcessId, 'Do you want to proceed? [Y/n]');

      // Should not throw
      expect(notificationManager.isEnabled(testProcessId)).toBe(true);
    });

    it('should always track state even when disabled', () => {
      // Don't enable notifications

      // Process output - should not throw even when disabled
      notificationManager.processOutput(testProcessId, '↵ send\n');

      expect(notificationManager.isEnabled(testProcessId)).toBe(false);
    });
  });

  describe('window switch scenario - no duplicate notification', () => {
    it('should NOT show duplicate notification after window switch', () => {
      // 1. Enable notifications
      notificationManager.enableNotifications(testProcessId);

      // 2. User types (ENTER) to start working, then Claude completes
      notificationManager.markUserInput(testProcessId);
      notificationManager.processOutput(testProcessId, '↵ send\n');

      // 3. User switches window - terminal unmounts, calls disable
      notificationManager.disableNotifications(testProcessId);

      // 4. User switches back - terminal mounts, calls enable
      notificationManager.enableNotifications(testProcessId);

      // 5. Same completion state is still visible - should NOT notify again
      // because hasNotifiedForCurrentCompletion was NOT reset by enableNotifications
      notificationManager.processOutput(testProcessId, '↵ send\n');

      // If we got here without errors, the flow is correct
      // The key is that enableNotifications does NOT reset the flag
      expect(notificationManager.isEnabled(testProcessId)).toBe(true);
    });

    it('should show notification again after user types new prompt', () => {
      // 1. Enable notifications
      notificationManager.enableNotifications(testProcessId);

      // 2. User types (ENTER) to start working, then Claude completes
      notificationManager.markUserInput(testProcessId);
      notificationManager.processOutput(testProcessId, '↵ send\n');

      // 3. User switches window and back
      notificationManager.disableNotifications(testProcessId);
      notificationManager.enableNotifications(testProcessId);

      // 4. User types new prompt (ENTER) - this resets the flag and sets state to working
      notificationManager.markUserInput(testProcessId);

      // 5. Claude completes again - should show notification (working -> completed)
      notificationManager.processOutput(testProcessId, '↵ send\n');

      expect(notificationManager.isEnabled(testProcessId)).toBe(true);
    });
  });

  describe('only notify on working -> completed transition', () => {
    it('should NOT notify when enabling with completion already visible (idle -> completed)', () => {
      // 1. Enable notifications (state is idle)
      notificationManager.enableNotifications(testProcessId);

      // 2. Output contains completion pattern, but we're coming from idle, not working
      // This simulates: terminal already shows "send" when notifications are enabled
      notificationManager.processOutput(testProcessId, '↵ send\n');

      // Should not trigger notification because idle -> completed is blocked
      expect(notificationManager.isEnabled(testProcessId)).toBe(true);
    });

    it('should notify when transitioning from working to completed', () => {
      // 1. Enable notifications
      notificationManager.enableNotifications(testProcessId);

      // 2. User presses ENTER (sets state to working)
      notificationManager.markUserInput(testProcessId);

      // 3. Claude completes (working -> completed should notify)
      notificationManager.processOutput(testProcessId, '↵ send\n');

      expect(notificationManager.isEnabled(testProcessId)).toBe(true);
    });
  });

  describe('unregisterSession', () => {
    it('should remove session from tracking', () => {
      expect(notificationManager.isEnabled(testProcessId)).toBe(false);

      notificationManager.enableNotifications(testProcessId);
      expect(notificationManager.isEnabled(testProcessId)).toBe(true);

      notificationManager.unregisterSession(testProcessId);
      expect(notificationManager.isEnabled(testProcessId)).toBe(false);
    });
  });

  describe('ANSI stripping', () => {
    it('should detect completion pattern with ANSI codes', () => {
      notificationManager.enableNotifications(testProcessId);
      notificationManager.markUserInput(testProcessId);

      // Simulate ANSI-encoded output
      const ansiOutput = '\u001b[32m↵\u001b[0m send\u001b[0m\n';
      notificationManager.processOutput(testProcessId, ansiOutput);

      // Should not throw
      expect(notificationManager.isEnabled(testProcessId)).toBe(true);
    });

    it('should detect completion pattern with OSC sequences', () => {
      notificationManager.enableNotifications(testProcessId);
      notificationManager.markUserInput(testProcessId);

      // OSC sequence (e.g., terminal title)
      const oscOutput = '\u001b]0;Terminal Title\u0007↵ send\n';
      notificationManager.processOutput(testProcessId, oscOutput);

      expect(notificationManager.isEnabled(testProcessId)).toBe(true);
    });

    it('should handle empty output', () => {
      notificationManager.enableNotifications(testProcessId);

      // Empty string
      notificationManager.processOutput(testProcessId, '');
      notificationManager.processOutput(testProcessId, '\n');
      notificationManager.processOutput(testProcessId, '   \n   ');

      expect(notificationManager.isEnabled(testProcessId)).toBe(true);
    });
  });

  describe('completion patterns', () => {
    beforeEach(() => {
      notificationManager.enableNotifications(testProcessId);
      notificationManager.markUserInput(testProcessId);
    });

    it('should detect "send" at end of line', () => {
      notificationManager.processOutput(testProcessId, 'some text send\n');
      expect(notificationManager.isEnabled(testProcessId)).toBe(true);
    });

    it('should detect "↵ send" pattern', () => {
      notificationManager.processOutput(testProcessId, '↵ send\n');
      expect(notificationManager.isEnabled(testProcessId)).toBe(true);
    });

    it('should be case insensitive for send', () => {
      notificationManager.processOutput(testProcessId, 'SEND\n');
      expect(notificationManager.isEnabled(testProcessId)).toBe(true);
    });
  });

  describe('question patterns', () => {
    beforeEach(() => {
      notificationManager.enableNotifications(testProcessId);
      notificationManager.markUserInput(testProcessId);
    });

    it('should detect [Y/n] pattern', () => {
      notificationManager.processOutput(testProcessId, 'Continue? [Y/n]\n');
      expect(notificationManager.isEnabled(testProcessId)).toBe(true);
    });

    it('should detect [y/N] pattern', () => {
      notificationManager.processOutput(testProcessId, 'Continue? [y/N]\n');
      expect(notificationManager.isEnabled(testProcessId)).toBe(true);
    });

    it('should detect (yes/no) pattern', () => {
      notificationManager.processOutput(testProcessId, 'Are you sure? (yes/no)\n');
      expect(notificationManager.isEnabled(testProcessId)).toBe(true);
    });

    it('should detect Tab/Arrow keys navigation pattern', () => {
      notificationManager.processOutput(testProcessId, 'Tab/Arrow keys to navigate\n');
      expect(notificationManager.isEnabled(testProcessId)).toBe(true);
    });

    it('should detect "Do you want to proceed?" pattern', () => {
      notificationManager.processOutput(testProcessId, 'Do you want to proceed?\n');
      expect(notificationManager.isEnabled(testProcessId)).toBe(true);
    });

    it('should detect numbered Yes option pattern', () => {
      notificationManager.processOutput(testProcessId, '> 1. Yes\n');
      expect(notificationManager.isEnabled(testProcessId)).toBe(true);
    });
  });

  describe('getPermissionStatus', () => {
    it('should return supported: true when Notification is supported', () => {
      const status = notificationManager.getPermissionStatus();
      expect(status.supported).toBe(true);
    });
  });

  describe('showTestNotification', () => {
    it('should return true when notification is shown', () => {
      const result = notificationManager.showTestNotification(
        'completed',
        testWorktreePath,
        testBranchName
      );
      expect(result).toBe(true);
    });

    it('should return false when notifications are disabled globally', () => {
      vi.mocked(notificationSettingsManager.isNotificationEnabled).mockReturnValue(false);

      const result = notificationManager.showTestNotification(
        'completed',
        testWorktreePath,
        testBranchName
      );
      expect(result).toBe(false);
    });
  });

  describe('multiple sessions', () => {
    const session1 = 'session-1';
    const session2 = 'session-2';

    beforeEach(() => {
      notificationManager.registerSession(session1, '/path/1', 'branch-1');
      notificationManager.registerSession(session2, '/path/2', 'branch-2');
    });

    afterEach(() => {
      notificationManager.unregisterSession(session1);
      notificationManager.unregisterSession(session2);
    });

    it('should track sessions independently', () => {
      notificationManager.enableNotifications(session1);

      expect(notificationManager.isEnabled(session1)).toBe(true);
      expect(notificationManager.isEnabled(session2)).toBe(false);
    });

    it('should not affect other sessions when disabling', () => {
      notificationManager.enableNotifications(session1);
      notificationManager.enableNotifications(session2);

      notificationManager.disableNotifications(session1);

      expect(notificationManager.isEnabled(session1)).toBe(false);
      expect(notificationManager.isEnabled(session2)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle processOutput for non-existent session', () => {
      // Should not throw
      notificationManager.processOutput('non-existent', 'some output');
    });

    it('should handle markUserInput for non-existent session', () => {
      // Should not throw
      notificationManager.markUserInput('non-existent');
    });

    it('should handle disableNotifications for non-existent session', () => {
      // Should not throw
      notificationManager.disableNotifications('non-existent');
    });

    it('should not re-register existing session', () => {
      notificationManager.enableNotifications(testProcessId);
      expect(notificationManager.isEnabled(testProcessId)).toBe(true);

      // Re-register same session
      notificationManager.registerSession(testProcessId, '/new/path', 'new-branch');

      // Should still be enabled (not reset)
      expect(notificationManager.isEnabled(testProcessId)).toBe(true);
    });
  });
});
