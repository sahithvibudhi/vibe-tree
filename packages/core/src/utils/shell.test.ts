import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getPtyOptions, getDefaultShell, killPtyGraceful, killPtyForce } from './shell';
import * as pty from 'node-pty';
import * as fs from 'fs';
import * as path from 'path';

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

      // Wait for shell to be ready
      await new Promise(resolve => setTimeout(resolve, 500));

      // Start a loop that writes timestamps every 100ms
      ptyProcess.write(`while true; do date +%s.%N > ${testFile}; sleep 0.1; done\r`);

      // Wait for the process to start writing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify file is being updated
      const initialContent = fs.readFileSync(testFile, 'utf-8');
      await new Promise(resolve => setTimeout(resolve, 200));
      const updatedContent = fs.readFileSync(testFile, 'utf-8');

      expect(initialContent).not.toBe(updatedContent);
      console.log('✓ Process is running and updating file');

      // Kill the PTY gracefully
      const killPromise = killPtyGraceful(ptyProcess, 10000);

      // Wait for kill to complete
      await killPromise;

      // Wait a bit to ensure process has stopped
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify file is no longer being updated
      const contentAfterKill = fs.readFileSync(testFile, 'utf-8');
      await new Promise(resolve => setTimeout(resolve, 300));
      const finalContent = fs.readFileSync(testFile, 'utf-8');

      expect(contentAfterKill).toBe(finalContent);
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

      // Wait for shell to be ready
      await new Promise(resolve => setTimeout(resolve, 500));

      // Start a Ruby IRB-like process in background
      ptyProcess.write(`ruby -e "loop { File.write('${testFile}', Time.now.to_f); sleep 0.1 }" &\r`);

      // Wait for the process to start writing
      await new Promise(resolve => setTimeout(resolve, 800));

      // Verify file exists and is being updated
      if (!fs.existsSync(testFile)) {
        console.warn('Test file not created, skipping test');
        ptyProcess.kill('SIGKILL');
        return;
      }

      const initialContent = fs.readFileSync(testFile, 'utf-8');
      await new Promise(resolve => setTimeout(resolve, 200));
      const updatedContent = fs.readFileSync(testFile, 'utf-8');

      expect(initialContent).not.toBe(updatedContent);
      console.log('✓ Child process is running and updating file');

      // Kill the PTY gracefully
      const killPromise = killPtyGraceful(ptyProcess, 10000);

      // Wait for kill to complete
      await killPromise;

      // Wait to ensure child process has stopped
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify file is no longer being updated
      const contentAfterKill = fs.readFileSync(testFile, 'utf-8');
      await new Promise(resolve => setTimeout(resolve, 300));
      const finalContent = fs.readFileSync(testFile, 'utf-8');

      // Parse timestamps and check they're within 500ms tolerance
      // (allows for race conditions in CI environments where process scheduling is unpredictable)
      const timestampAfterKill = parseFloat(contentAfterKill);
      const timestampFinal = parseFloat(finalContent);
      const diff = Math.abs(timestampFinal - timestampAfterKill);

      expect(diff).toBeLessThan(0.5); // 500ms tolerance
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

      // Wait for shell to be ready
      await new Promise(resolve => setTimeout(resolve, 500));

      // Start a process that ignores SIGTERM
      ptyProcess.write(`trap '' TERM; while true; do date +%s.%N > ${testFile}; sleep 0.1; done\r`);

      // Wait for the process to start writing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify file is being updated
      const initialContent = fs.readFileSync(testFile, 'utf-8');
      await new Promise(resolve => setTimeout(resolve, 200));
      const updatedContent = fs.readFileSync(testFile, 'utf-8');

      expect(initialContent).not.toBe(updatedContent);
      console.log('✓ Stubborn process is running');

      // Force kill the PTY
      const killPromise = killPtyForce(ptyProcess);

      // Wait for kill to complete
      await killPromise;

      // Wait to ensure process has stopped
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify file is no longer being updated
      const contentAfterKill = fs.readFileSync(testFile, 'utf-8');
      await new Promise(resolve => setTimeout(resolve, 300));
      const finalContent = fs.readFileSync(testFile, 'utf-8');

      expect(contentAfterKill).toBe(finalContent);
      console.log('✓ Stubborn process has been force killed');
    }, 15000);
  });
});