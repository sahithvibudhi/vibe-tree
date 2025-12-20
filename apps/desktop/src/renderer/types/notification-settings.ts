// Notification settings types shared between main and renderer
export interface NotificationSettings {
  /** Master toggle for all notifications */
  enabled: boolean;
}

export type NotificationSettingsUpdate = Partial<NotificationSettings>;

export type ClaudeNotificationType = 'completed' | 'question';

export interface NotificationPermissionStatus {
  /** Whether notifications are supported on this platform */
  supported: boolean;
  /** Whether the app is authorized to show notifications */
  authorized: boolean;
  /** Detailed authorization status */
  authorizationStatus: 'not-determined' | 'denied' | 'authorized' | 'provisional' | 'unknown';
}
