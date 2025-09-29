import { describe, it, expect } from 'vitest';
import { escapeShellPath } from '@vibetree/core';

// Test the escapeShellPath function
describe('ClaudeTerminal - escapeShellPath', () => {

  it('should correctly escape shell paths', () => {
    expect(escapeShellPath('/simple/path')).toBe('/simple/path');
    expect(escapeShellPath('/path with spaces/file.txt')).toBe("'/path with spaces/file.txt'");
    expect(escapeShellPath("/path/with'quotes.txt")).toBe("'/path/with'\\''quotes.txt'");
    expect(escapeShellPath('/path/with$var.txt')).toBe("'/path/with$var.txt'");
    expect(escapeShellPath('/path/(with)/parentheses.txt')).toBe("'/path/(with)/parentheses.txt'");
  });

  it('should handle complex paths with multiple special characters', () => {
    expect(escapeShellPath("/Users/My Documents/Project (2024)/it's & file's.txt"))
      .toBe("'/Users/My Documents/Project (2024)/it'\\''s & file'\\''s.txt'");
  });

  it('should not escape paths without special characters', () => {
    expect(escapeShellPath('/home/user/file.txt')).toBe('/home/user/file.txt');
    expect(escapeShellPath('/usr/local/bin/app')).toBe('/usr/local/bin/app');
    expect(escapeShellPath('README.md')).toBe('README.md');
  });

  it('should handle paths with brackets and braces', () => {
    expect(escapeShellPath('/path/[test].txt')).toBe("'/path/[test].txt'");
    expect(escapeShellPath('/path/{test}.txt')).toBe("'/path/{test}.txt'");
    expect(escapeShellPath('/path/test[1-9].txt')).toBe("'/path/test[1-9].txt'");
  });

  it('should handle paths with shell operators', () => {
    expect(escapeShellPath('/path/file|pipe.txt')).toBe("'/path/file|pipe.txt'");
    expect(escapeShellPath('/path/file&background.txt')).toBe("'/path/file&background.txt'");
    expect(escapeShellPath('/path/file;semicolon.txt')).toBe("'/path/file;semicolon.txt'");
    expect(escapeShellPath('/path/file>redirect.txt')).toBe("'/path/file>redirect.txt'");
    expect(escapeShellPath('/path/file<input.txt')).toBe("'/path/file<input.txt'");
  });

  it('should handle paths with wildcards', () => {
    expect(escapeShellPath('/path/*.txt')).toBe("'/path/*.txt'");
    expect(escapeShellPath('/path/file?.txt')).toBe("'/path/file?.txt'");
  });

  it('should handle paths with backslashes', () => {
    expect(escapeShellPath('C:\\Users\\file.txt')).toBe("'C:\\Users\\file.txt'");
    expect(escapeShellPath('/path\\with\\backslashes')).toBe("'/path\\with\\backslashes'");
  });

  it('should handle paths with exclamation marks', () => {
    expect(escapeShellPath('/path/file!important.txt')).toBe("'/path/file!important.txt'");
  });

  it('should handle paths with hash symbols', () => {
    expect(escapeShellPath('/path/file#1.txt')).toBe("'/path/file#1.txt'");
  });

  it('should handle empty strings and edge cases', () => {
    expect(escapeShellPath('')).toBe('');
    expect(escapeShellPath('.')).toBe('.');
    expect(escapeShellPath('..')).toBe('..');
    expect(escapeShellPath('/')).toBe('/');
  });
});