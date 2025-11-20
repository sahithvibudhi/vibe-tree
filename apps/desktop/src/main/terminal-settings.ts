import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export interface TerminalSettings {
  fontFamily: string;
  fontSize: number;
  cursorBlink: boolean;
  scrollback: number;
  tabStopWidth: number;
  setLocaleVariables: boolean;
}

export type TerminalSettingsUpdate = Partial<TerminalSettings>;

const DEFAULT_SETTINGS: TerminalSettings = {
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  fontSize: 14,
  cursorBlink: true,
  scrollback: 10000,
  tabStopWidth: 4,
  setLocaleVariables: true
};

class TerminalSettingsManager {
  private settings: TerminalSettings = { ...DEFAULT_SETTINGS };
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

    this.storageFile = path.join(app.getPath('userData'), 'terminal-settings.json');
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
      console.error('Failed to load terminal settings:', error);
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
      console.error('Failed to save terminal settings:', error);
    }
  }

  getSettings(): TerminalSettings {
    return { ...this.settings };
  }

  updateSettings(updates: TerminalSettingsUpdate) {
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

  // Get list of common monospace fonts for the UI
  getAvailableFonts(): string[] {
    return [
      'Menlo, Monaco, "Courier New", monospace',
      '"Cascadia Code", Menlo, Monaco, monospace',
      '"Fira Code", Menlo, Monaco, monospace',
      '"JetBrains Mono", Menlo, Monaco, monospace',
      '"Source Code Pro", Menlo, Monaco, monospace',
      '"SF Mono", Monaco, Menlo, monospace',
      'Consolas, "Courier New", monospace',
      '"IBM Plex Mono", Monaco, Menlo, monospace',
      '"Roboto Mono", Monaco, Menlo, monospace',
      '"Ubuntu Mono", Monaco, Menlo, monospace',
      'monospace'
    ];
  }
}

export const terminalSettingsManager = new TerminalSettingsManager();