import * as crypto from 'crypto';

// Type definitions to avoid importing node-pty directly
export interface IPty {
  pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
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

  // Remove Electron-specific environment variables that shouldn't leak into shells
  // ELECTRON_RUN_AS_NODE makes Electron behave as Node.js, causing issues with
  // Electron-based tools (like VSCode) run from within the terminal
  delete env.ELECTRON_RUN_AS_NODE;
  
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
 * Kill a PTY process gracefully - now uses force kill (SIGKILL) immediately
 * The "graceful" approach with SIGTERM was not reliably killing child processes
 * @param ptyProcess - The PTY process to kill
 * @param _timeoutMs - Kept for backwards compatibility but not used
 * @returns Promise that resolves when the process exits
 */
export async function killPtyGraceful(ptyProcess: IPty, _timeoutMs?: number): Promise<void> {
  // Graceful kill with SIGTERM doesn't work reliably for killing child processes like irb
  // Force kill with SIGKILL to process group is the only reliable way
  return killPtyForce(ptyProcess);
}

/**
 * Force kill a PTY process (SIGKILL to process group)
 * @param ptyProcess - The PTY process to kill
 * @returns Promise that resolves when the process is killed
 */
export async function killPtyForce(ptyProcess: IPty): Promise<void> {
  return new Promise<void>((resolve) => {
    const pid = ptyProcess.pid;
    let isKilled = false;
    let exitListener: { dispose: () => void } | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    let cleanup = (source: 'exit' | 'timeout') => {
      console.log(`PTY process ${pid} cleanup triggered by: ${source}`);

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (exitListener) {
        exitListener.dispose();
        exitListener = null;
      }

      if (!isKilled) {
        isKilled = true;
        resolve();
      }
    };

    // Listen for exit event
    exitListener = ptyProcess.onExit(() => {
      console.log(`PTY process ${pid} exit event fired`);
      cleanup('exit');
    });

    // Send SIGKILL to force kill
    try {
      if (process.platform !== 'win32') {
        // Send SIGKILL to process group to ensure all processes are killed
        try {
          process.kill(-pid, 'SIGKILL');
          console.log(`Sent SIGKILL to process group -${pid}`);
        } catch (pgError) {
          console.warn(`Could not kill process group -${pid}, falling back to PTY process:`, pgError);
          ptyProcess.kill('SIGKILL');
          console.log(`Sent SIGKILL to PTY process ${pid}`);
        }
      } else {
        ptyProcess.kill('SIGKILL');
        console.log(`Sent SIGKILL to PTY process ${pid}`);
      }
    } catch (error) {
      console.error(`Error sending SIGKILL to PTY process ${pid}:`, error);
      cleanup('timeout');
      return;
    }

    // Fallback timeout in case exit event never fires
    // This should rarely happen with SIGKILL
    timeoutId = setTimeout(() => {
      console.warn(`PTY process ${pid} exit event did not fire within 500ms, forcing cleanup`);
      cleanup('timeout');
    }, 500);
  });
}

/**
 * Kill a PTY process with graceful shutdown and forceful fallback
 * Backward compatibility wrapper - tries graceful first, then forces
 * @param ptyProcess - The PTY process to kill
 * @param timeoutMs - Timeout in milliseconds before force kill (default: 2000ms)
 * @returns Promise that resolves when the process is killed
 */
export async function killPty(ptyProcess: IPty, timeoutMs: number = 2000): Promise<void> {
  try {
    await killPtyGraceful(ptyProcess, timeoutMs);
  } catch (error) {
    // If graceful kill times out, force kill
    console.log(`Graceful kill timed out, force killing PTY process ${ptyProcess.pid}`);
    await killPtyForce(ptyProcess);
  }
}

/**
 * Synchronous version of killPty for backward compatibility
 * Note: This does not wait for process to exit, use killPty for robust cleanup
 * @param ptyProcess - The PTY process to kill
 */
export function killPtySync(ptyProcess: IPty): void {
  try {
    ptyProcess.kill('SIGTERM');
  } catch (error) {
    console.error('Error killing PTY process:', error);
  }
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