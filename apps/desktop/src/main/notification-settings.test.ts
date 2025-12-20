import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/vibetree-test')
  }
}));

// Mock fs
vi.mock('fs');

describe('NotificationSettingsManager', () => {
  const mockFs = vi.mocked(fs);
  const expectedStoragePath = path.join('/tmp/vibetree-test', 'notification-settings.json');

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock default filesystem behavior
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockReturnValue('{}');
    mockFs.writeFileSync.mockImplementation(() => {});
    mockFs.mkdirSync.mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('should initialize with default settings when no file exists', async () => {
    mockFs.existsSync.mockReturnValue(false);

    const { notificationSettingsManager } = await import('./notification-settings');
    notificationSettingsManager.initialize();

    const settings = notificationSettingsManager.getSettings();

    expect(settings.enabled).toBe(true);
  });

  it('should load existing settings from file', async () => {
    const savedSettings = { enabled: false };

    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(savedSettings));

    const { notificationSettingsManager } = await import('./notification-settings');
    notificationSettingsManager.initialize();

    const settings = notificationSettingsManager.getSettings();

    expect(settings.enabled).toBe(false);
  });

  it('should merge loaded settings with defaults', async () => {
    // Simulate old settings file without new properties
    const partialSettings = {};

    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(partialSettings));

    const { notificationSettingsManager } = await import('./notification-settings');
    notificationSettingsManager.initialize();

    const settings = notificationSettingsManager.getSettings();

    // Should have default value for enabled
    expect(settings.enabled).toBe(true);
  });

  it('should update settings and save to file', async () => {
    mockFs.existsSync.mockReturnValue(false);

    const { notificationSettingsManager } = await import('./notification-settings');
    notificationSettingsManager.initialize();

    notificationSettingsManager.updateSettings({ enabled: false });

    const settings = notificationSettingsManager.getSettings();
    expect(settings.enabled).toBe(false);

    // Verify save was called
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expectedStoragePath,
      expect.stringContaining('"enabled": false')
    );
  });

  it('should reset to default settings', async () => {
    const savedSettings = { enabled: false };

    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(savedSettings));

    const { notificationSettingsManager } = await import('./notification-settings');
    notificationSettingsManager.initialize();

    // Verify loaded settings
    expect(notificationSettingsManager.getSettings().enabled).toBe(false);

    // Reset to defaults
    notificationSettingsManager.resetToDefaults();

    const settings = notificationSettingsManager.getSettings();
    expect(settings.enabled).toBe(true);

    // Verify save was called with defaults
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expectedStoragePath,
      expect.stringContaining('"enabled": true')
    );
  });

  it('should return copy of settings to prevent mutation', async () => {
    mockFs.existsSync.mockReturnValue(false);

    const { notificationSettingsManager } = await import('./notification-settings');
    notificationSettingsManager.initialize();

    const settings1 = notificationSettingsManager.getSettings();
    settings1.enabled = false;

    const settings2 = notificationSettingsManager.getSettings();

    // Original should not be mutated
    expect(settings2.enabled).toBe(true);
  });

  it('should handle corrupted file gracefully', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('invalid json');

    const { notificationSettingsManager } = await import('./notification-settings');
    notificationSettingsManager.initialize();

    // Should use defaults
    const settings = notificationSettingsManager.getSettings();
    expect(settings.enabled).toBe(true);
  });

  it('should create directory if it does not exist when saving', async () => {
    mockFs.existsSync.mockImplementation(() => {
      // Storage file doesn't exist, but we need to check dir too
      return false;
    });

    const { notificationSettingsManager } = await import('./notification-settings');
    notificationSettingsManager.initialize();

    notificationSettingsManager.updateSettings({ enabled: false });

    expect(mockFs.mkdirSync).toHaveBeenCalledWith('/tmp/vibetree-test', { recursive: true });
    expect(mockFs.writeFileSync).toHaveBeenCalled();
  });

  it('should only initialize once', async () => {
    mockFs.existsSync.mockReturnValue(false);

    const { notificationSettingsManager } = await import('./notification-settings');

    // Call initialize multiple times
    notificationSettingsManager.initialize();
    notificationSettingsManager.initialize();
    notificationSettingsManager.initialize();

    // readFileSync should only be called once (during first initialize)
    // Note: existsSync is called in loadSettings, so we check that
    const existsSyncCalls = mockFs.existsSync.mock.calls.filter(
      call => call[0] === expectedStoragePath
    );
    expect(existsSyncCalls.length).toBe(1);
  });

  describe('isNotificationEnabled', () => {
    it('should return true when enabled', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { notificationSettingsManager } = await import('./notification-settings');
      notificationSettingsManager.initialize();

      expect(notificationSettingsManager.isNotificationEnabled()).toBe(true);
    });

    it('should return false when disabled', async () => {
      const savedSettings = { enabled: false };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(savedSettings));

      const { notificationSettingsManager } = await import('./notification-settings');
      notificationSettingsManager.initialize();

      expect(notificationSettingsManager.isNotificationEnabled()).toBe(false);
    });
  });
});
