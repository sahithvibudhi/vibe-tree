import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export interface AppSettings {
  hasSeenOnboarding: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  hasSeenOnboarding: false
};

class AppSettingsManager {
  private settings: AppSettings = { ...DEFAULT_SETTINGS };
  private storageFile!: string;
  private _initialized = false;

  public initialize() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;

    this.storageFile = path.join(app.getPath('userData'), 'app-settings.json');
    this.loadSettings();
  }

  private loadSettings() {
    try {
      if (fs.existsSync(this.storageFile)) {
        const data = fs.readFileSync(this.storageFile, 'utf8');
        this.settings = {
          ...DEFAULT_SETTINGS,
          ...JSON.parse(data)
        };
      }
    } catch (error) {
      console.error('Failed to load app settings:', error);
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
      console.error('Failed to save app settings:', error);
    }
  }

  getSettings(): AppSettings {
    return { ...this.settings };
  }

  updateSettings(updates: Partial<AppSettings>): AppSettings {
    this.settings = {
      ...this.settings,
      ...updates
    };
    this.saveSettings();
    return this.getSettings();
  }
}

export const appSettingsManager = new AppSettingsManager();
