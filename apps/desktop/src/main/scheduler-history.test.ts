import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

// Mock electron app
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/tmp/test-user-data'),
  },
}));

// Mock fs module
jest.mock('fs');

describe('SchedulerHistoryManager', () => {
  let SchedulerHistoryManager: any;
  let schedulerHistoryManager: any;
  const mockStorageFile = path.join('/tmp/test-user-data', 'scheduler-history.json');

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the module cache to get a fresh instance
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create storage file path using app.getPath', () => {
      const { schedulerHistoryManager: manager } = require('./scheduler-history');
      expect(app.getPath).toHaveBeenCalledWith('userData');
    });

    it('should load existing history from file', () => {
      const mockHistory = [
        { command: 'echo "test"', delayMs: 1000, repeat: false, timestamp: Date.now() },
      ];

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockHistory));

      const { schedulerHistoryManager: manager } = require('./scheduler-history');
      const history = manager.getHistory();

      expect(fs.readFileSync).toHaveBeenCalledWith(mockStorageFile, 'utf8');
      expect(history).toEqual(mockHistory);
    });

    it('should handle missing history file gracefully', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const { schedulerHistoryManager: manager } = require('./scheduler-history');
      const history = manager.getHistory();

      expect(history).toEqual([]);
    });

    it('should handle corrupted history file gracefully', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('invalid json');

      const { schedulerHistoryManager: manager } = require('./scheduler-history');
      const history = manager.getHistory();

      expect(history).toEqual([]);
    });

    it('should filter out invalid entries when loading', () => {
      const mixedData = [
        { command: 'valid', delayMs: 1000, repeat: false, timestamp: Date.now() },
        { command: 'missing delayMs', repeat: false, timestamp: Date.now() },
        { command: 123, delayMs: 1000, repeat: false, timestamp: Date.now() }, // invalid type
        { command: 'valid2', delayMs: 2000, repeat: true, timestamp: Date.now() },
      ];

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mixedData));

      const { schedulerHistoryManager: manager } = require('./scheduler-history');
      const history = manager.getHistory();

      expect(history).toHaveLength(2);
      expect(history[0].command).toBe('valid');
      expect(history[1].command).toBe('valid2');
    });

    it('should limit history to max 20 entries when loading', () => {
      const now = Date.now();
      const largeHistory = Array.from({ length: 30 }, (_, i) => ({
        command: `cmd${i}`,
        delayMs: 1000,
        repeat: false,
        timestamp: now - i * 1000, // Older entries have smaller timestamps
      }));

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(largeHistory));

      const { schedulerHistoryManager: manager } = require('./scheduler-history');
      const history = manager.getHistory();

      expect(history).toHaveLength(20);
      // Should keep the most recent entries
      expect(history[0].command).toBe('cmd0');
    });
  });

  describe('addHistoryEntry', () => {
    beforeEach(() => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);
    });

    it('should add new entry to history', () => {
      const { schedulerHistoryManager: manager } = require('./scheduler-history');

      manager.addHistoryEntry('echo test', 1000, false);
      const history = manager.getHistory();

      expect(history).toHaveLength(1);
      expect(history[0].command).toBe('echo test');
      expect(history[0].delayMs).toBe(1000);
      expect(history[0].repeat).toBe(false);
      expect(history[0].timestamp).toBeDefined();
    });

    it('should save history to file after adding', () => {
      const { schedulerHistoryManager: manager } = require('./scheduler-history');

      manager.addHistoryEntry('echo test', 1000, false);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        mockStorageFile,
        expect.any(String)
      );
    });

    it('should create directory if it does not exist', () => {
      const { schedulerHistoryManager: manager } = require('./scheduler-history');

      manager.addHistoryEntry('echo test', 1000, false);

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        path.dirname(mockStorageFile),
        { recursive: true }
      );
    });

    it('should move duplicate entry to front with updated timestamp', () => {
      const { schedulerHistoryManager: manager } = require('./scheduler-history');

      const timestamp1 = Date.now();
      manager.addHistoryEntry('echo test', 1000, false);

      // Wait a bit to ensure different timestamp
      const timestamp2 = Date.now() + 100;
      jest.spyOn(Date, 'now').mockReturnValue(timestamp2);

      manager.addHistoryEntry('echo test', 1000, false);
      const history = manager.getHistory();

      expect(history).toHaveLength(1);
      expect(history[0].timestamp).toBe(timestamp2);
    });

    it('should treat entries with different settings as unique', () => {
      const { schedulerHistoryManager: manager } = require('./scheduler-history');

      manager.addHistoryEntry('echo test', 1000, false);
      manager.addHistoryEntry('echo test', 1000, true); // Different repeat
      manager.addHistoryEntry('echo test', 2000, false); // Different delay

      const history = manager.getHistory();

      expect(history).toHaveLength(3);
    });

    it('should limit history to 20 entries', () => {
      const { schedulerHistoryManager: manager } = require('./scheduler-history');

      // Add 25 unique entries
      for (let i = 0; i < 25; i++) {
        manager.addHistoryEntry(`cmd${i}`, 1000, false);
      }

      const history = manager.getHistory();

      expect(history).toHaveLength(20);
      // Most recent entries should be kept
      expect(history[0].command).toBe('cmd24');
      expect(history[19].command).toBe('cmd5');
    });

    it('should add new entries to the front of history', () => {
      const { schedulerHistoryManager: manager } = require('./scheduler-history');

      manager.addHistoryEntry('first', 1000, false);
      manager.addHistoryEntry('second', 2000, true);

      const history = manager.getHistory();

      expect(history[0].command).toBe('second');
      expect(history[1].command).toBe('first');
    });
  });

  describe('getHistory', () => {
    it('should return history sorted by timestamp descending', () => {
      const now = Date.now();
      const mockHistory = [
        { command: 'old', delayMs: 1000, repeat: false, timestamp: now - 2000 },
        { command: 'new', delayMs: 1000, repeat: false, timestamp: now },
        { command: 'middle', delayMs: 1000, repeat: false, timestamp: now - 1000 },
      ];

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockHistory));

      const { schedulerHistoryManager: manager } = require('./scheduler-history');
      const history = manager.getHistory();

      expect(history[0].command).toBe('new');
      expect(history[1].command).toBe('middle');
      expect(history[2].command).toBe('old');
    });

    it('should return a copy of the history array', () => {
      const { schedulerHistoryManager: manager } = require('./scheduler-history');

      manager.addHistoryEntry('test', 1000, false);
      const history1 = manager.getHistory();
      const history2 = manager.getHistory();

      expect(history1).not.toBe(history2);
      expect(history1).toEqual(history2);
    });
  });

  describe('clearHistory', () => {
    it('should remove all history entries', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);

      const { schedulerHistoryManager: manager } = require('./scheduler-history');

      manager.addHistoryEntry('test1', 1000, false);
      manager.addHistoryEntry('test2', 2000, true);

      manager.clearHistory();
      const history = manager.getHistory();

      expect(history).toEqual([]);
    });

    it('should save empty history to file', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);

      const { schedulerHistoryManager: manager } = require('./scheduler-history');

      manager.addHistoryEntry('test', 1000, false);
      manager.clearHistory();

      expect(fs.writeFileSync).toHaveBeenLastCalledWith(
        mockStorageFile,
        JSON.stringify([], null, 2)
      );
    });
  });

  describe('error handling', () => {
    it('should handle file write errors gracefully', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.mkdirSync as jest.Mock).mockImplementation(() => {
        throw new Error('Write permission denied');
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { schedulerHistoryManager: manager } = require('./scheduler-history');

      // Should not throw
      expect(() => manager.addHistoryEntry('test', 1000, false)).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});
