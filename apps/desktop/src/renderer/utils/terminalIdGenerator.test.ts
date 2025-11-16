import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateTerminalId,
  resetTerminalCounter,
  getTerminalCounter
} from './terminalIdGenerator';

describe('terminalIdGenerator', () => {
  beforeEach(() => {
    resetTerminalCounter();
  });

  describe('generateTerminalId', () => {
    it('should generate unique IDs using a counter', () => {
      const worktree = '/path/to/project';

      const id1 = generateTerminalId(worktree);
      const id2 = generateTerminalId(worktree);
      const id3 = generateTerminalId(worktree);

      expect(id1).toBe('/path/to/project-0');
      expect(id2).toBe('/path/to/project-1');
      expect(id3).toBe('/path/to/project-2');
    });

    it('should prevent ID collisions when called rapidly', () => {
      const worktree = '/path/to/project';
      const ids = new Set<string>();

      // Simulate rapid terminal splits
      for (let i = 0; i < 100; i++) {
        ids.add(generateTerminalId(worktree));
      }

      // All IDs should be unique
      expect(ids.size).toBe(100);
    });

    it('should work with different worktree paths', () => {
      const id1 = generateTerminalId('/path/to/project1');
      const id2 = generateTerminalId('/path/to/project2');

      expect(id1).toBe('/path/to/project1-0');
      expect(id2).toBe('/path/to/project2-1');
    });
  });

  describe('resetTerminalCounter', () => {
    it('should reset counter to zero', () => {
      generateTerminalId('/test');
      generateTerminalId('/test');
      expect(getTerminalCounter()).toBe(2);

      resetTerminalCounter();
      expect(getTerminalCounter()).toBe(0);

      const id = generateTerminalId('/test');
      expect(id).toBe('/test-0');
    });
  });

  describe('getTerminalCounter', () => {
    it('should return current counter value', () => {
      expect(getTerminalCounter()).toBe(0);

      generateTerminalId('/test');
      expect(getTerminalCounter()).toBe(1);

      generateTerminalId('/test');
      expect(getTerminalCounter()).toBe(2);
    });
  });
});
