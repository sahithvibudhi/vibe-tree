import { app } from 'electron';
import path from 'path';
import fs from 'fs';

/**
 * Settings
 */
export interface NotificationSettings {
  /** Master toggle for all notifications */
  enabled: boolean;
}

export type NotificationSettingsUpdate = Partial<NotificationSettings>;

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
};

class NotificationSettingsManager {
  private settings: NotificationSettings = { ...DEFAULT_SETTINGS };
  private storageFile!: string;
  private _initialized = false;

  constructor() {
    // Defer initialization until app is ready
  }

  /**
   * Initialize the settings manager (must be called when app is ready)
   * Loads settings from disk
   */
  public initialize() {
    if (this._initialized) {
      return; // Already initialized
    }
    this._initialized = true;

    this.storageFile = path.join(app.getPath('userData'), 'notification-settings.json');
    this.loadSettings();
  }

  private loadSettings() {
    try {
      if (fs.existsSync(this.storageFile)) {
        const data = fs.readFileSync(this.storageFile, 'utf8');
        const loadedSettings = JSON.parse(data);

        // Merge with defaults to ensure all properties exist
        this.settings = {
          ...DEFAULT_SETTINGS,
          ...loadedSettings
        };
      }
    } catch (error) {
      console.error('Failed to load notification settings:', error);
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  private saveSettings() {
    try {
      const dir = path.dirname(this.storageFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storageFile, JSON.stringify(this.settings, null, 2));
    } catch (error) {
      console.error('Failed to save notification settings:', error);
    }
  }

  getSettings(): NotificationSettings {
    return { ...this.settings };
  }

  updateSettings(updates: NotificationSettingsUpdate) {
    this.settings = {
      ...this.settings,
      ...updates
    };
    this.saveSettings();
  }

  resetToDefaults() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.saveSettings();
  }

  /**
   * Check if notifications are enabled
   */
  isNotificationEnabled(): boolean {
    return this.settings.enabled;
  }
}

export const notificationSettingsManager = new NotificationSettingsManager();
