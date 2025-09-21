import * as crypto from 'crypto';

// Type definitions to avoid importing node-pty directly
export interface IPty {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(callback: (data: string) => void): { dispose: () => void };
  onExit(callback: (event: { exitCode: number }) => void): { dispose: () => void };
}

/**
 * Get the default shell for the current platform
 * @returns Shell path
 */
export function getDefaultShell(): string {
  return process.platform === 'win32' 
    ? 'powershell.exe' 
    : process.env.SHELL || '/bin/bash';
}

/**
 * Get PTY spawn options
 * @param worktreePath - Directory to start the shell in
 * @param cols - Terminal columns (default: 80)
 * @param rows - Terminal rows (default: 30)
 * @returns Options for spawning PTY
 */
/**
 * Get system locale for macOS
 * @returns System locale with UTF-8 suffix
 */
function getSystemLocale(): string {
  if (process.platform === 'darwin') {
    try {
      // Try to get macOS system locale preference
      const { execSync } = require('child_process');
      const appleLocale = execSync('defaults read NSGlobalDomain AppleLocale 2>/dev/null', { 
        encoding: 'utf8' 
      }).trim();
      
      if (appleLocale) {
        // Convert Apple locale format (e.g., 'en_US') to POSIX format (e.g., 'en_US.UTF-8')
        return `${appleLocale}.UTF-8`;
      }
    } catch (error) {
      // Silently fall through to default
    }
  }
  
  // Default fallback
  return 'en_US.UTF-8';
}

export function getPtyOptions(
  worktreePath: string, 
  cols: number = 80, 
  rows: number = 30,
  setLocaleVariables: boolean = true
): any {
  // Create a copy of process.env to avoid modifying the original
  const env = { ...process.env } as Record<string, string>;
  
  // Set LANG if not already set and setting is enabled
  // This matches iTerm2 and Terminal.app "Set locale environment variables automatically" behavior
  if (setLocaleVariables && (!env.LANG || env.LANG === '')) {
    // Use the system's locale preference, matching iTerm2's behavior
    env.LANG = getSystemLocale();
  }
  
  return {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: worktreePath,
    env
  };
}

/**
 * Write data to a PTY process
 * @param ptyProcess - The PTY process to write to
 * @param data - Data to write
 */
export function writeToPty(ptyProcess: IPty, data: string): void {
  ptyProcess.write(data);
}

/**
 * Resize a PTY process terminal dimensions
 * @param ptyProcess - The PTY process to resize
 * @param cols - New column count
 * @param rows - New row count
 */
export function resizePty(ptyProcess: IPty, cols: number, rows: number): void {
  ptyProcess.resize(cols, rows);
}

/**
 * Kill a PTY process
 * @param ptyProcess - The PTY process to kill
 */
export function killPty(ptyProcess: IPty): void {
  ptyProcess.kill();
}

/**
 * Generate a deterministic session ID based on worktree path
 * @param worktreePath - Path to generate ID from
 * @returns 16-character hex string
 */
export function generateSessionId(worktreePath: string): string {
  return crypto.createHash('sha256')
    .update(worktreePath)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Attach a data listener to PTY process
 * @param ptyProcess - The PTY process
 * @param callback - Callback for data events
 * @returns Disposable to remove the listener
 */
export function onPtyData(
  ptyProcess: IPty, 
  callback: (data: string) => void
): { dispose: () => void } {
  return ptyProcess.onData(callback);
}

/**
 * Attach an exit listener to PTY process
 * @param ptyProcess - The PTY process
 * @param callback - Callback for exit events
 * @returns Disposable to remove the listener
 */
export function onPtyExit(
  ptyProcess: IPty, 
  callback: (exitCode: number) => void
): { dispose: () => void } {
  return ptyProcess.onExit((event) => callback(event.exitCode));
}