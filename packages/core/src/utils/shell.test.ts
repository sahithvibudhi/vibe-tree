import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getPtyOptions, getDefaultShell, killPtyGraceful, killPtyForce } from './shell';
import * as pty from 'node-pty';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Wait until a condition is true, with timeout
 */
async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number; message?: string } = {}
): Promise<void> {
  const { timeout = 5000, interval = 50, message = 'Condition not met' } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`${message} (timed out after ${timeout}ms)`);
}

/**
 * Wait until a file exists
 */
async function waitForFile(filePath: string, timeout = 5000): Promise<void> {
  await waitUntil(() => fs.existsSync(filePath), {
    timeout,
    message: `File ${filePath} not created`
  });
}

/**
 * Wait until file content changes from initial value
 */
async function waitForFileChange(filePath: string, initialContent: string, timeout = 5000): Promise<string> {
  let currentContent = initialContent;
  await waitUntil(() => {
    if (!fs.existsSync(filePath)) return false;
    currentContent = fs.readFileSync(filePath, 'utf-8');
    return currentContent !== initialContent;
  }, {
    timeout,
    message: `File ${filePath} content did not change`
  });
  return currentContent;
}

/**
 * Wait until file content stops changing (process has stopped writing)
 */
async function waitForFileStable(filePath: string, stabilityPeriod = 300, timeout = 5000): Promise<string> {
  let lastContent = '';
  let lastChangeTime = Date.now();
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (fs.existsSync(filePath)) {
      const currentContent = fs.readFileSync(filePath, 'utf-8');
      if (currentContent !== lastContent) {
        lastContent = currentContent;
        lastChangeTime = Date.now();
      } else if (Date.now() - lastChangeTime >= stabilityPeriod) {
        return lastContent;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  throw new Error(`File ${filePath} did not stabilize (timed out after ${timeout}ms)`);
}

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

  describe('process killing', () => {
    let testTempDir: string;

    beforeEach(() => {
      testTempDir = `/tmp/vibe-tree-test-${Date.now()}`;
      fs.mkdirSync(testTempDir, { recursive: true });
    });

    afterEach(() => {
      // Clean up temp directory
      if (fs.existsSync(testTempDir)) {
        fs.rmSync(testTempDir, { recursive: true, force: true });
      }
    });

    it('should kill a process running in the PTY', async () => {
      // Create a test file path
      const testFile = path.join(testTempDir, 'timestamp.txt');

      // Spawn a PTY with a script that writes timestamps
      const ptyProcess = pty.spawn('/bin/bash', [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 30,
        cwd: testTempDir,
        env: process.env as any
      });

      // Start a loop that writes timestamps every 100ms
      ptyProcess.write(`while true; do date +%s.%N > ${testFile}; sleep 0.1; done\r`);

      // Wait for file to be created
      await waitForFile(testFile);

      // Verify file is being updated by waiting for content to change
      const initialContent = fs.readFileSync(testFile, 'utf-8');
      const updatedContent = await waitForFileChange(testFile, initialContent);

      expect(initialContent).not.toBe(updatedContent);
      console.log('✓ Process is running and updating file');

      // Kill the PTY gracefully
      await killPtyGraceful(ptyProcess, 10000);

      // Wait for file to stabilize (no more writes)
      const stableContent = await waitForFileStable(testFile, 300, 5000);

      // Verify file stayed stable
      const finalContent = fs.readFileSync(testFile, 'utf-8');
      expect(stableContent).toBe(finalContent);
      console.log('✓ Process has stopped updating file after kill');
    }, 15000);

    it('should kill child processes when PTY is killed', async () => {
      // Create a test file path
      const testFile = path.join(testTempDir, 'child-timestamp.txt');

      // Spawn a PTY
      const ptyProcess = pty.spawn('/bin/bash', [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 30,
        cwd: testTempDir,
        env: process.env as any
      });

      // Start a child process (not backgrounded - running in foreground of shell)
      // Use bash subshell to simulate a child process that writes timestamps
      ptyProcess.write(`bash -c 'while true; do date +%s.%N > ${testFile}; sleep 0.1; done'\r`);

      // Wait for file to be created
      await waitForFile(testFile);

      // Verify file is being updated by waiting for content to change
      const initialContent = fs.readFileSync(testFile, 'utf-8');
      const updatedContent = await waitForFileChange(testFile, initialContent);

      expect(initialContent).not.toBe(updatedContent);
      console.log('✓ Child process is running and updating file');

      // Kill the PTY gracefully
      await killPtyGraceful(ptyProcess, 10000);

      // Wait for file to stabilize (no more writes)
      const stableContent = await waitForFileStable(testFile, 300, 5000);

      // Verify file stayed stable
      const finalContent = fs.readFileSync(testFile, 'utf-8');
      expect(stableContent).toBe(finalContent);
      console.log('✓ Child process has stopped after PTY kill');
    }, 15000);

    it('should force kill stubborn processes', async () => {
      // Create a test file path
      const testFile = path.join(testTempDir, 'stubborn-timestamp.txt');

      // Spawn a PTY
      const ptyProcess = pty.spawn('/bin/bash', [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 30,
        cwd: testTempDir,
        env: process.env as any
      });

      // Start a process that ignores SIGTERM
      ptyProcess.write(`trap '' TERM; while true; do date +%s.%N > ${testFile}; sleep 0.1; done\r`);

      // Wait for file to be created
      await waitForFile(testFile);

      // Verify file is being updated by waiting for content to change
      const initialContent = fs.readFileSync(testFile, 'utf-8');
      const updatedContent = await waitForFileChange(testFile, initialContent);

      expect(initialContent).not.toBe(updatedContent);
      console.log('✓ Stubborn process is running');

      // Force kill the PTY
      await killPtyForce(ptyProcess);

      // Wait for file to stabilize (no more writes)
      const stableContent = await waitForFileStable(testFile, 300, 5000);

      // Verify file stayed stable
      const finalContent = fs.readFileSync(testFile, 'utf-8');
      expect(stableContent).toBe(finalContent);
      console.log('✓ Stubborn process has been force killed');
    }, 15000);
  });
});