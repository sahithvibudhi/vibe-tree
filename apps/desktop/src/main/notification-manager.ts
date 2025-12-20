import { Notification, BrowserWindow, app, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { notificationSettingsManager } from './notification-settings';

// macOS notification flags - bit 25 controls "Allow Notifications"
const ALLOW_NOTIFICATIONS_BIT = 1 << 25; // 33554432

export type ClaudeNotificationType = 'completed' | 'question';

export interface NotificationPermissionStatus {
  supported: boolean;
  authorized: boolean;
  authorizationStatus: 'not-determined' | 'denied' | 'authorized' | 'provisional' | 'unknown';
}

interface NotificationInfo {
  type: ClaudeNotificationType;
  worktreePath: string;
  branchName: string;
  processId: string;
}

type ClaudeState = 'idle' | 'working' | 'completed' | 'question';

/**
 * Session tracking for notifications
 * All state is managed in main process - no React lifecycle issues
 */
interface SessionNotificationState {
  enabled: boolean;
  worktreePath: string;
  branchName: string;
  currentState: ClaudeState;
  // Track if we've already notified for the current completion
  // Reset when user types (new prompt), not when terminal outputs
  hasNotifiedForCurrentCompletion: boolean;
}

/**
 * Strip ANSI escape codes from terminal output
 */
/* eslint-disable no-control-regex */
const ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g;
const OSC_REGEX = /\u001b\].*?(?:\u0007|\u001b\\)/g;
const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000b\u000c\u000e-\u001a]/g;
/* eslint-enable no-control-regex */

function stripAnsi(str: string): string {
  if (typeof str !== 'string') return '';
  return str.replace(OSC_REGEX, '').replace(ANSI_REGEX, '').replace(CONTROL_CHARS_REGEX, '');
}

function stripAnsiAndSplitLines(str: string): string[] {
  const cleaned = stripAnsi(str);
  return cleaned.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
}

/**
 * Patterns for state detection
 */
const COMPLETION_PATTERNS: RegExp[] = [
  /send\s*$/i,
  /↵\s*send/i,
];

const QUESTION_PATTERNS: RegExp[] = [
  /Enter to select.*Tab\/Arrow keys to navigate.*Esc to cancel/i,
  /Tab\/Arrow keys to navigate/i,
  /\[Y\/n\]/,
  /\[y\/N\]/,
  /\(yes\/no\)/i,
  /Do you want to proceed\?/i,
  />\s*\d+\.\s*Yes/i,
];

/**
 * Manager for Claude Code CLI native OS notifications
 *
 * ALL notification logic is in main process:
 * - State detection from terminal output
 * - Tracking enabled/disabled per session
 * - Tracking if Claude has been working since enabled
 * - Deciding when to show notifications
 *
 * This avoids all React lifecycle issues in the renderer.
 */
class NotificationManager {
  private sessions: Map<string, SessionNotificationState> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private _initialized = false;


  /**
   * Initialize the notification manager with the main window reference
   */
  initialize(window: BrowserWindow | null) {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    this.mainWindow = window;
  }

  /**
   * Update the main window reference (e.g., if window is recreated)
   */
  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window;
  }

  /**
   * Register a terminal session for notification tracking
   */
  registerSession(processId: string, worktreePath: string, branchName: string) {
    if (!this.sessions.has(processId)) {
      this.sessions.set(processId, {
        enabled: false,
        worktreePath,
        branchName,
        currentState: 'idle',
        hasNotifiedForCurrentCompletion: false,
      });
    }
  }

  /**
   * Unregister a terminal session
   */
  unregisterSession(processId: string) {
    this.sessions.delete(processId);
  }

  /**
   * Enable notifications for a session
   * Returns true if enabled successfully
   */
  enableNotifications(processId: string): boolean {
    const session = this.sessions.get(processId);
    if (!session) {
      return false;
    }

    session.enabled = true;
    // IMPORTANT: Do NOT reset hasNotifiedForCurrentCompletion here
    // The flag is ONLY reset when user types (markUserInput)
    // This prevents duplicate notifications on window switch + re-enable

    return true;
  }

  /**
   * Disable notifications for a session
   */
  disableNotifications(processId: string) {
    const session = this.sessions.get(processId);
    if (session) {
      session.enabled = false;
    }
  }

  /**
   * Check if notifications are enabled for a session
   */
  isEnabled(processId: string): boolean {
    return this.sessions.get(processId)?.enabled ?? false;
  }

  /**
   * Mark that user has typed input (new prompt)
   * This resets the notification flag to allow notification for next completion
   */
  markUserInput(processId: string) {
    const session = this.sessions.get(processId);
    if (session && session.enabled) {
      // User typed something - reset flag to allow notification for next completion
      session.hasNotifiedForCurrentCompletion = false;
      session.currentState = 'working';
    }
  }

  /**
   * Process terminal output for a session
   * This is called from shell-manager for every output chunk
   * NOTE: We ALWAYS track state, even if notifications are disabled
   * This allows us to know the current state when user enables notifications
   */
  processOutput(processId: string, data: string) {
    const session = this.sessions.get(processId);
    if (!session) {
      return;
    }

    // Strip ANSI and split into lines
    const lines = stripAnsiAndSplitLines(data);
    if (lines.length === 0) return;

    // Always analyze state changes - notification decision is in transitionTo
    this.analyzeForStateChange(session, processId, lines);
  }

  /**
   * Match patterns helper
   */
  private matchPatterns(line: string, patterns: RegExp[]): string | null {
    for (const pattern of patterns) {
      if (pattern.test(line)) return pattern.source;
    }
    return null;
  }

  /**
   * Analyze lines for state changes
   * NOTE: "working" state is NOT detected from output - only from user input (markUserInput)
   * This prevents false triggers from terminal escape sequences
   */
  private analyzeForStateChange(session: SessionNotificationState, processId: string, lines: string[]) {
    const now = Date.now();

    for (const line of lines) {
      // Check for question patterns first (higher priority)
      const questionMatch = this.matchPatterns(line, QUESTION_PATTERNS);
      if (questionMatch && session.currentState !== 'question') {
        this.transitionTo(session, processId, 'question', now);
        return;
      }

      // Check for completion patterns
      const completionMatch = this.matchPatterns(line, COMPLETION_PATTERNS);
      if (completionMatch && session.currentState !== 'completed') {
        this.transitionTo(session, processId, 'completed', now);
        return;
      }

      // NOTE: We do NOT detect "working" from output anymore
      // "working" state is only set via markUserInput() when user types
      // This prevents false triggers from terminal escape sequences, cursor movements, etc.
    }
  }

  /**
   * Handle state transition and potentially show notification
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private transitionTo(session: SessionNotificationState, processId: string, newState: ClaudeState, _now: number) {
    const prevState = session.currentState;
    session.currentState = newState;

    // Only trigger notifications for completed or question states
    if (newState === 'completed' || newState === 'question') {
      // Must be enabled
      if (!session.enabled) {
        return;
      }

      // Only notify if transitioning FROM working state
      // This prevents notification when:
      // - Terminal already shows completion when notifications are enabled (idle -> completed)
      // - Re-detecting same completion pattern
      if (prevState !== 'working') {
        return;
      }

      // KEY CHECK: Only notify ONCE per completion
      // This flag is reset when user presses ENTER (markUserInput)
      if (session.hasNotifiedForCurrentCompletion) {
        return;
      }

      // Check global notification setting
      if (!notificationSettingsManager.isNotificationEnabled()) {
        return;
      }

      // Show the notification and mark as notified
      session.hasNotifiedForCurrentCompletion = true;
      this.showNotification(newState, session.worktreePath, session.branchName, processId);
    }
  }

  /**
   * Show a test notification (public method for testing from settings)
   */
  showTestNotification(
    type: ClaudeNotificationType,
    worktreePath: string,
    branchName: string
  ): boolean {
    // Check global notification setting
    if (!notificationSettingsManager.isNotificationEnabled()) {
      return false;
    }
    return this.showNotification(type, worktreePath, branchName, 'test');
  }

  /**
   * Show a native notification
   */
  private showNotification(
    type: ClaudeNotificationType,
    worktreePath: string,
    branchName: string,
    processId: string
  ): boolean {
    // Check if Notification is supported
    if (!Notification.isSupported()) {
      return false;
    }

    // Create notification content
    const projectName = path.basename(worktreePath);
    const title = `${projectName} (${branchName})`;
    const body = type === 'completed'
      ? 'Prompt completed'
      : 'Ask question';

    // Create and show the notification
    const notification = new Notification({
      title,
      body,
      silent: false,
      icon: this.getNotificationIcon(),
    });

    // Store info for click handling
    const notificationInfo: NotificationInfo = {
      type,
      worktreePath,
      branchName,
      processId,
    };

    // Handle notification click
    notification.on('click', () => {
      this.handleNotificationClick(notificationInfo);
    });

    notification.show();
    return true;
  }

  /**
   * Handle notification click - focus window and notify renderer
   */
  private handleNotificationClick(info: NotificationInfo) {
    if (this.mainWindow) {
      // Show and focus the window
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.show();
      this.mainWindow.focus();

      // Notify the renderer about the click so it can switch to the terminal
      this.mainWindow.webContents.send('claude-notification:clicked', info.processId, info.worktreePath);
    }
  }

  /**
   * Get the notification icon path
   */
  private getNotificationIcon(): string | undefined {
    // Try to find the app icon
    const iconPaths = [
      path.join(__dirname, '../../assets/icons/VibeTree.png'),
      path.join(app.getAppPath(), 'assets/icons/VibeTree.png'),
    ];

    for (const iconPath of iconPaths) {
      if (fs.existsSync(iconPath)) {
        return iconPath;
      }
    }

    return undefined;
  }

  /**
   * Get the system notification permission status
   */
  getPermissionStatus(): NotificationPermissionStatus {
    const supported = Notification.isSupported();

    if (!supported) {
      return {
        supported: false,
        authorized: false,
        authorizationStatus: 'unknown',
      };
    }

    // On macOS, check ncprefs.plist for notification permission
    if (process.platform === 'darwin') {
      try {
        const status = this.getMacOSNotificationStatus();
        if (status !== null) {
          return status;
        }
      } catch {
        // Failed to get notification settings, fall through to default
      }
    }

    // For other platforms or if check fails, assume authorized
    return {
      supported: true,
      authorized: true,
      authorizationStatus: 'unknown',
    };
  }

  /**
   * Read macOS notification permission from ncprefs.plist
   */
  private getMacOSNotificationStatus(): NotificationPermissionStatus | null {
    const bundleIds = ['com.github.Electron', 'com.vibetree.desktop'];

    for (const bundleId of bundleIds) {
      try {
        const output = execSync(
          `defaults read com.apple.ncprefs 2>/dev/null | grep -A10 "${bundleId}" | grep "flags" | head -1`,
          { encoding: 'utf8', timeout: 5000 }
        ).trim();

        const flagsMatch = output.match(/flags\s*=\s*(\d+)/);
        if (flagsMatch) {
          const flags = parseInt(flagsMatch[1], 10);
          const isAllowed = (flags & ALLOW_NOTIFICATIONS_BIT) !== 0;

          return {
            supported: true,
            authorized: isAllowed,
            authorizationStatus: isAllowed ? 'authorized' : 'denied',
          };
        }
      } catch {
        continue;
      }
    }

    return {
      supported: true,
      authorized: false,
      authorizationStatus: 'not-determined',
    };
  }

  /**
   * Open system notification settings
   */
  openSystemSettings(): void {
    if (process.platform === 'darwin') {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.notifications');
    } else if (process.platform === 'win32') {
      shell.openExternal('ms-settings:notifications');
    } else {
      shell.openExternal('gnome-control-center notifications');
    }
  }
}

export const notificationManager = new NotificationManager();
