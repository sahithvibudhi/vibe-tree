import { describe, it, expect } from 'vitest';
import { escapeShellPath } from './shell-escape';

describe('escapeShellPath', () => {
  it('should not escape simple paths without special characters', () => {
    expect(escapeShellPath('/home/user/file.txt')).toBe('/home/user/file.txt');
    expect(escapeShellPath('/usr/local/bin/app')).toBe('/usr/local/bin/app');
    expect(escapeShellPath('file.txt')).toBe('file.txt');
    expect(escapeShellPath('README.md')).toBe('README.md');
  });

  it('should escape paths with spaces', () => {
    expect(escapeShellPath('/home/user/my file.txt')).toBe("'/home/user/my file.txt'");
    expect(escapeShellPath('my folder/file.txt')).toBe("'my folder/file.txt'");
    expect(escapeShellPath('/path with spaces/file.txt')).toBe("'/path with spaces/file.txt'");
  });

  it('should escape paths with single quotes', () => {
    expect(escapeShellPath("/home/user/it's.txt")).toBe("'/home/user/it'\\''s.txt'");
    expect(escapeShellPath("don't.txt")).toBe("'don'\\''t.txt'");
    expect(escapeShellPath("/path/with'quotes.txt")).toBe("'/path/with'\\''quotes.txt'");
  });

  it('should escape paths with double quotes', () => {
    expect(escapeShellPath('/home/user/"quoted".txt')).toBe('\'/home/user/"quoted".txt\'');
    expect(escapeShellPath('file"with"quotes.txt')).toBe('\'file"with"quotes.txt\'');
  });

  it('should escape paths with parentheses', () => {
    expect(escapeShellPath('/home/user/file(1).txt')).toBe("'/home/user/file(1).txt'");
    expect(escapeShellPath('/home/user/file)test(.txt')).toBe("'/home/user/file)test(.txt'");
    expect(escapeShellPath('/path/(with)/parentheses.txt')).toBe("'/path/(with)/parentheses.txt'");
  });

  it('should escape paths with brackets', () => {
    expect(escapeShellPath('/path/[test].txt')).toBe("'/path/[test].txt'");
    expect(escapeShellPath('/path/{test}.txt')).toBe("'/path/{test}.txt'");
    expect(escapeShellPath('/path/test[1-9].txt')).toBe("'/path/test[1-9].txt'");
  });

  it('should escape paths with special shell characters', () => {
    expect(escapeShellPath('/path/file&test.txt')).toBe("'/path/file&test.txt'");
    expect(escapeShellPath('/path/file|test.txt')).toBe("'/path/file|test.txt'");
    expect(escapeShellPath('/path/file;test.txt')).toBe("'/path/file;test.txt'");
    expect(escapeShellPath('/path/file<test>.txt')).toBe("'/path/file<test>.txt'");
    expect(escapeShellPath('/path/file*test.txt')).toBe("'/path/file*test.txt'");
    expect(escapeShellPath('/path/file?test.txt')).toBe("'/path/file?test.txt'");
  });

  it('should escape paths with dollar signs', () => {
    expect(escapeShellPath('/home/user/$file.txt')).toBe("'/home/user/$file.txt'");
    expect(escapeShellPath('/path/with$var.txt')).toBe("'/path/with$var.txt'");
  });

  it('should escape paths with backslashes', () => {
    expect(escapeShellPath('/home/user\\file.txt')).toBe("'/home/user\\file.txt'");
    expect(escapeShellPath('C:\\Users\\file.txt')).toBe("'C:\\Users\\file.txt'");
    expect(escapeShellPath('/path\\with\\backslashes')).toBe("'/path\\with\\backslashes'");
  });

  it('should escape paths with exclamation marks', () => {
    expect(escapeShellPath('/path/file!important.txt')).toBe("'/path/file!important.txt'");
  });

  it('should escape paths with hash symbols', () => {
    expect(escapeShellPath('/path/file#1.txt')).toBe("'/path/file#1.txt'");
  });

  it('should handle complex paths with multiple special characters', () => {
    expect(escapeShellPath("/home/user/My Documents/Project (2024)/it's & file's.txt"))
      .toBe("'/home/user/My Documents/Project (2024)/it'\\''s & file'\\''s.txt'");
    expect(escapeShellPath("/Users/My Documents/Project (2024)/it's & file's.txt"))
      .toBe("'/Users/My Documents/Project (2024)/it'\\''s & file'\\''s.txt'");
  });

  it('should handle empty strings and edge cases', () => {
    expect(escapeShellPath('')).toBe('');
    expect(escapeShellPath('.')).toBe('.');
    expect(escapeShellPath('..')).toBe('..');
    expect(escapeShellPath('/')).toBe('/');
  });

  it('should handle paths with wildcards', () => {
    expect(escapeShellPath('/path/*.txt')).toBe("'/path/*.txt'");
    expect(escapeShellPath('/path/file?.txt')).toBe("'/path/file?.txt'");
  });
});