/**
 * PTY Worker Process
 *
 * This worker runs in a forked Node.js process and manages a single PTY session.
 * Each terminal has its own fork process for complete isolation.
 *
 * Communication with main process via IPC:
 * - Receives: start, write, resize, terminate commands
 * - Sends: output, exit, error events
 */

import * as pty from 'node-pty';
import { execSync } from 'child_process';
import {
  getDefaultShell,
  getPtyOptions,
  writeToPty,
  resizePty,
  killPtyForce,
  onPtyData,
  onPtyExit,
  type IPty
} from '../utils/shell';

interface StartMessage {
  type: 'start';
  worktreePath: string;
  cols: number;
  rows: number;
  setLocaleVariables: boolean;
}

interface WriteMessage {
  type: 'write';
  data: string;
}

interface ResizeMessage {
  type: 'resize';
  cols: number;
  rows: number;
}

interface TerminateMessage {
  type: 'terminate';
}

interface DiagnosticsMessage {
  type: 'diagnostics';
}

interface GetForegroundProcessMessage {
  type: 'getForegroundProcess';
}

type WorkerMessage = StartMessage | WriteMessage | ResizeMessage | TerminateMessage | DiagnosticsMessage | GetForegroundProcessMessage;

interface OutputEvent {
  type: 'output';
  data: string;
}

interface ExitEvent {
  type: 'exit';
  code: number;
}

interface ErrorEvent {
  type: 'error';
  error: string;
}

interface ReadyEvent {
  type: 'ready';
}

interface DiagnosticsEvent {
  type: 'diagnostics';
  data: {
    ptyMasterFds: number;
    ptySlaveFds: number;
    totalPtyFds: number;
    hasPty: boolean;
  };
}

interface ForegroundProcessEvent {
  type: 'foregroundProcess';
  data: {
    pid: number | null;
    command: string | null;
  };
}

type WorkerEvent = OutputEvent | ExitEvent | ErrorEvent | ReadyEvent | DiagnosticsEvent | ForegroundProcessEvent;

class PtyWorker {
  private ptyProcess: IPty | null = null;
  private dataDisposable: { dispose: () => void } | null = null;

  constructor() {
    this.setupMessageHandler();
    this.sendMessage({ type: 'ready' });
  }

  private setupMessageHandler() {
    process.on('message', (message: WorkerMessage) => {
      try {
        switch (message.type) {
          case 'start':
            this.handleStart(message);
            break;
          case 'write':
            this.handleWrite(message);
            break;
          case 'resize':
            this.handleResize(message);
            break;
          case 'terminate':
            this.handleTerminate();
            break;
          case 'diagnostics':
            this.handleDiagnostics();
            break;
          case 'getForegroundProcess':
            this.handleGetForegroundProcess();
            break;
        }
      } catch (error) {
        this.sendMessage({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Handle parent process exit
    process.on('disconnect', () => {
      console.log('[pty-worker] Parent disconnected, exiting...');
      this.cleanup();
      process.exit(0);
    });
  }

  private handleStart(message: StartMessage) {
    if (this.ptyProcess) {
      this.sendMessage({
        type: 'error',
        error: 'PTY already started'
      });
      return;
    }

    try {
      const shell = getDefaultShell();
      const options = getPtyOptions(
        message.worktreePath,
        message.cols,
        message.rows,
        message.setLocaleVariables
      );

      // Launch as login shell
      const shellArgs = shell.includes('zsh') || shell.includes('bash') ? ['-l'] : [];

      this.ptyProcess = pty.spawn(shell, shellArgs, options);

      // Handle PTY output
      this.dataDisposable = onPtyData(this.ptyProcess, (data) => {
        this.sendMessage({ type: 'output', data });
      });

      // Handle PTY exit
      onPtyExit(this.ptyProcess, (exitCode) => {
        this.sendMessage({ type: 'exit', code: exitCode });
        this.cleanup();
        process.exit(0);
      });

      console.log(`[pty-worker] Started PTY in ${message.worktreePath} (PID: ${this.ptyProcess.pid})`);
    } catch (error) {
      this.sendMessage({
        type: 'error',
        error: error instanceof Error ? error.message : 'Failed to start PTY'
      });
    }
  }

  private handleWrite(message: WriteMessage) {
    if (!this.ptyProcess) {
      this.sendMessage({
        type: 'error',
        error: 'PTY not started'
      });
      return;
    }

    try {
      writeToPty(this.ptyProcess, message.data);
    } catch (error) {
      this.sendMessage({
        type: 'error',
        error: error instanceof Error ? error.message : 'Failed to write to PTY'
      });
    }
  }

  private handleResize(message: ResizeMessage) {
    if (!this.ptyProcess) {
      this.sendMessage({
        type: 'error',
        error: 'PTY not started'
      });
      return;
    }

    try {
      resizePty(this.ptyProcess, message.cols, message.rows);
    } catch (error) {
      this.sendMessage({
        type: 'error',
        error: error instanceof Error ? error.message : 'Failed to resize PTY'
      });
    }
  }

  private async handleTerminate() {
    console.log('[pty-worker] Terminate requested');
    this.cleanup();
    process.exit(0);
  }

  private async handleDiagnostics() {
    try {
      const diagnostics = await this.getPtyDiagnostics();
      this.sendMessage({
        type: 'diagnostics',
        data: diagnostics
      });
    } catch (error) {
      console.error('[pty-worker] Error getting diagnostics:', error);
      this.sendMessage({
        type: 'diagnostics',
        data: {
          ptyMasterFds: 0,
          ptySlaveFds: 0,
          totalPtyFds: 0,
          hasPty: false
        }
      });
    }
  }

  private handleGetForegroundProcess() {
    const result = this.getForegroundProcess();
    this.sendMessage({
      type: 'foregroundProcess',
      data: result
    });
  }

  /**
   * Get the foreground process running in the PTY (child of shell)
   * Returns the command name if a child process is running
   */
  private getForegroundProcess(): { pid: number | null; command: string | null } {
    if (!this.ptyProcess?.pid) {
      return { pid: null, command: null };
    }

    const shellPid = this.ptyProcess.pid;

    if (process.platform === 'darwin' || process.platform === 'linux') {
      try {
        // Get child process PID of the shell
        const childPidOutput = execSync(`pgrep -P ${shellPid} 2>/dev/null`, { encoding: 'utf-8' }).trim();

        if (!childPidOutput) {
          return { pid: null, command: null };
        }

        // Take the first child PID (there could be multiple)
        const childPid = parseInt(childPidOutput.split('\n')[0], 10);

        if (isNaN(childPid)) {
          return { pid: null, command: null };
        }

        // Get the command name for this PID
        const command = execSync(`ps -o comm= -p ${childPid} 2>/dev/null`, { encoding: 'utf-8' }).trim();

        return { pid: childPid, command: command || null };
      } catch {
        // No child process or command failed
        return { pid: null, command: null };
      }
    }

    return { pid: null, command: null };
  }

  /**
   * Get PTY file descriptor counts for this process
   */
  private async getPtyDiagnostics(): Promise<{
    ptyMasterFds: number;
    ptySlaveFds: number;
    totalPtyFds: number;
    hasPty: boolean;
  }> {
    const pid = process.pid;
    let ptyMasterFds = 0;
    let ptySlaveFds = 0;
    let totalPtyFds = 0;

    if (process.platform === 'darwin' || process.platform === 'linux') {
      try {
        // Count PTY master devices (/dev/ptmx)
        const masterOutput = execSync(`lsof -p ${pid} 2>/dev/null | grep "/dev/ptmx" | wc -l`, { encoding: 'utf-8' });
        ptyMasterFds = parseInt(masterOutput.trim(), 10) || 0;
      } catch (error) {
        ptyMasterFds = 0;
      }

      try {
        // Count PTY slave devices (ttys/ttyp)
        const slaveOutput = execSync(`lsof -p ${pid} 2>/dev/null | grep -E "ttys|ttyp" | wc -l`, { encoding: 'utf-8' });
        ptySlaveFds = parseInt(slaveOutput.trim(), 10) || 0;
      } catch (error) {
        ptySlaveFds = 0;
      }

      try {
        // Count total PTY-related file descriptors
        const totalOutput = execSync(`lsof -p ${pid} 2>/dev/null | grep -E "/dev/tty|/dev/ptmx" | wc -l`, { encoding: 'utf-8' });
        totalPtyFds = parseInt(totalOutput.trim(), 10) || 0;
      } catch (error) {
        totalPtyFds = 0;
      }
    }

    return {
      ptyMasterFds,
      ptySlaveFds,
      totalPtyFds,
      hasPty: this.ptyProcess !== null
    };
  }

  private cleanup() {
    if (this.dataDisposable) {
      this.dataDisposable.dispose();
      this.dataDisposable = null;
    }

    if (this.ptyProcess) {
      try {
        killPtyForce(this.ptyProcess);
      } catch (error) {
        console.error('[pty-worker] Error killing PTY:', error);
      }
      this.ptyProcess = null;
    }
  }

  private sendMessage(event: WorkerEvent) {
    if (process.send) {
      process.send(event);
    }
  }
}

// Start the worker
new PtyWorker();
