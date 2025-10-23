import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock electron before importing QuitManager
vi.mock('electron', () => ({
  app: {
    quit: vi.fn(),
    exit: vi.fn(),
    on: vi.fn()
  },
  dialog: {
    showMessageBoxSync: vi.fn()
  },
  BrowserWindow: {
    on: vi.fn(),
    isDestroyed: vi.fn(() => false)
  }
}));

import { QuitManager } from './quit-manager';
import { app, dialog, BrowserWindow } from 'electron';

describe('QuitManager', () => {
  let quitManager: QuitManager;
  let onQuitConfirmed: ReturnType<typeof vi.fn>;
  let onQuitCancelled: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onQuitConfirmed = vi.fn();
    onQuitCancelled = vi.fn();

    quitManager = new QuitManager({
      enableDialog: true,
      onQuitConfirmed,
      onQuitCancelled
    });
  });

  describe('showQuitConfirmation', () => {
    it('should show dialog and quit when confirmed', async () => {
      vi.mocked(dialog.showMessageBoxSync).mockReturnValue(1); // OK button

      const mockWindow = { on: vi.fn(), isDestroyed: vi.fn(() => false) };
      const result = quitManager.showQuitConfirmation(mockWindow as unknown as BrowserWindow);

      // Wait for async confirmQuit to complete
      await vi.waitFor(() => {
        expect(onQuitConfirmed).toHaveBeenCalled();
      });

      expect(dialog.showMessageBoxSync).toHaveBeenCalledWith(
        mockWindow,
        expect.objectContaining({
          type: 'question',
          title: 'Quit VibeTree?',
          message: 'Quit VibeTree?',
          detail: 'All sessions will be closed.',
          buttons: ['Cancel', 'OK']
        })
      );

      expect(result).toBe(true);
      expect(app.quit).toHaveBeenCalled();
      expect(quitManager.getIsQuitting()).toBe(true);
    });

    it('should show dialog and cancel when cancelled', () => {
      vi.mocked(dialog.showMessageBoxSync).mockReturnValue(0); // Cancel button

      const mockWindow = { on: vi.fn(), isDestroyed: vi.fn(() => false) };
      const result = quitManager.showQuitConfirmation(mockWindow as unknown as BrowserWindow);

      expect(result).toBe(false);
      expect(onQuitCancelled).toHaveBeenCalled();
      expect(app.quit).not.toHaveBeenCalled();
      expect(quitManager.getIsQuitting()).toBe(false);
    });

    it('should quit immediately when dialog is disabled', async () => {
      quitManager.setDialogEnabled(false);

      const mockWindow = { on: vi.fn(), isDestroyed: vi.fn(() => false) };
      const result = quitManager.showQuitConfirmation(mockWindow as unknown as BrowserWindow);

      // Wait for async confirmQuit to complete
      await vi.waitFor(() => {
        expect(onQuitConfirmed).toHaveBeenCalled();
      });

      expect(dialog.showMessageBoxSync).not.toHaveBeenCalled();
      expect(result).toBe(true);
      expect(app.quit).toHaveBeenCalled();
      expect(quitManager.getIsQuitting()).toBe(true);
    });

    it('should show dialog without window when mainWindow is null', () => {
      vi.mocked(dialog.showMessageBoxSync).mockReturnValue(1); // OK button

      const result = quitManager.showQuitConfirmation(null);

      expect(dialog.showMessageBoxSync).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'question',
          title: 'Quit VibeTree?'
        })
      );

      expect(result).toBe(true);
    });
  });

  describe('confirmQuit', () => {
    it('should set isQuitting to true and call app.quit()', async () => {
      await quitManager.confirmQuit();

      expect(quitManager.getIsQuitting()).toBe(true);
      expect(onQuitConfirmed).toHaveBeenCalled();
      expect(app.quit).toHaveBeenCalled();
    });
  });

  describe('cancelQuit', () => {
    it('should set isQuitting to false and call onQuitCancelled', () => {
      quitManager.cancelQuit();

      expect(quitManager.getIsQuitting()).toBe(false);
      expect(onQuitCancelled).toHaveBeenCalled();
      expect(app.quit).not.toHaveBeenCalled();
    });
  });

  describe('forceQuit', () => {
    it('should force quit the application without confirmation', () => {
      quitManager.forceQuit();

      expect(quitManager.getIsQuitting()).toBe(true);
      expect(app.exit).toHaveBeenCalledWith(0);
      expect(dialog.showMessageBoxSync).not.toHaveBeenCalled();
    });
  });

  describe('initialization', () => {
    it('should respect DISABLE_QUIT_DIALOG environment variable', () => {
      // Set environment variable
      process.env.DISABLE_QUIT_DIALOG = 'true';

      const manager = new QuitManager({
        enableDialog: process.env.DISABLE_QUIT_DIALOG !== 'true'
      });

      expect(manager.options.enableDialog).toBe(false);

      // Clean up
      delete process.env.DISABLE_QUIT_DIALOG;
    });

    it('should enable dialog by default', () => {
      const manager = new QuitManager();
      expect(manager.options.enableDialog).toBe(true);
    });
  });

  describe('setDialogEnabled', () => {
    it('should update dialog enabled state', () => {
      quitManager.setDialogEnabled(false);
      expect(quitManager.options.enableDialog).toBe(false);

      quitManager.setDialogEnabled(true);
      expect(quitManager.options.enableDialog).toBe(true);
    });
  });
});