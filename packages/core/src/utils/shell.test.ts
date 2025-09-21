import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getPtyOptions, getDefaultShell } from './shell';

describe('shell utils', () => {
  describe('getPtyOptions', () => {
    const originalEnv = process.env;
    const originalPlatform = process.platform;

    beforeEach(() => {
      // Reset environment before each test
      process.env = { ...originalEnv };
      // Mock child_process for locale detection
      vi.resetModules();
    });

    afterEach(() => {
      process.env = originalEnv;
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    });

    it('should set LANG to en_US.UTF-8 when not present and setLocaleVariables is true', () => {
      delete process.env.LANG;
      const options = getPtyOptions('/test/path');
      
      expect(options.env.LANG).toBe('en_US.UTF-8');
    });

    it('should not set LANG when setLocaleVariables is false', () => {
      delete process.env.LANG;
      const options = getPtyOptions('/test/path', 80, 30, false);
      
      expect(options.env.LANG).toBeUndefined();
    });

    it('should preserve existing LANG when already set', () => {
      process.env.LANG = 'fr_FR.UTF-8';
      const options = getPtyOptions('/test/path');
      
      expect(options.env.LANG).toBe('fr_FR.UTF-8');
    });

    it('should set LANG when it exists but is empty', () => {
      process.env.LANG = '';
      const options = getPtyOptions('/test/path');
      
      expect(options.env.LANG).toBe('en_US.UTF-8');
    });

    it('should fallback to en_US.UTF-8 on macOS when system locale detection fails', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });
      
      delete process.env.LANG;
      
      // The actual implementation will try to read system locale but fail in tests
      // and fallback to en_US.UTF-8
      const options = getPtyOptions('/test/path');
      
      expect(options.env.LANG).toBe('en_US.UTF-8');
    });

    it('should include all required PTY options', () => {
      const options = getPtyOptions('/test/path', 100, 50);
      
      expect(options).toMatchObject({
        name: 'xterm-256color',
        cols: 100,
        rows: 50,
        cwd: '/test/path',
      });
      expect(options.env).toBeDefined();
    });
  });

  describe('getDefaultShell', () => {
    const originalPlatform = process.platform;
    const originalShell = process.env.SHELL;

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
      process.env.SHELL = originalShell;
    });

    it('should return powershell.exe on Windows', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      
      expect(getDefaultShell()).toBe('powershell.exe');
    });

    it('should return SHELL environment variable on Unix', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });
      process.env.SHELL = '/bin/zsh';
      
      expect(getDefaultShell()).toBe('/bin/zsh');
    });

    it('should default to /bin/bash when SHELL is not set', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      delete process.env.SHELL;
      
      expect(getDefaultShell()).toBe('/bin/bash');
    });
  });
});