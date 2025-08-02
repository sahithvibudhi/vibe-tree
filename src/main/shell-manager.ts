import { ipcMain } from 'electron';
import * as crypto from 'crypto';
import * as pty from 'node-pty';

interface ShellProcess {
  pty: pty.IPty;
  worktreePath: string;
  processId: string;
  listeners: Map<string, { handler: (data: string) => void; disposable?: { dispose: () => void } }>;
}

class ShellProcessManager {
  private processes: Map<string, ShellProcess> = new Map();

  constructor() {
    this.setupIpcHandlers();
  }

  private setupIpcHandlers() {
    ipcMain.handle('shell:start', async (event, worktreePath: string, cols?: number, rows?: number) => {
      return this.startOrGetProcess(event.sender, worktreePath, cols, rows);
    });

    ipcMain.handle('shell:write', async (_, processId: string, data: string) => {
      return this.writeToProcess(processId, data);
    });

    ipcMain.handle('shell:resize', async (_, processId: string, cols: number, rows: number) => {
      return this.resizeProcess(processId, cols, rows);
    });

    ipcMain.handle('shell:status', async (_, processId: string) => {
      return { running: this.processes.has(processId) };
    });

    ipcMain.handle('shell:get-buffer', async (_, processId: string) => {
      return this.getProcessBuffer(processId);
    });
  }

  private getProcessId(worktreePath: string): string {
    // Create deterministic ID based on worktree path
    return crypto.createHash('sha256').update(worktreePath).digest('hex').substring(0, 16);
  }

  private async startOrGetProcess(sender: Electron.WebContents, worktreePath: string, cols?: number, rows?: number) {
    const processId = this.getProcessId(worktreePath);

    // Check if process already exists
    if (this.processes.has(processId)) {
      const existingProcess = this.processes.get(processId)!;
      
      // Create a unique listener ID for this sender
      const listenerId = sender.id.toString();
      
      // Remove old listener if exists
      const oldListenerInfo = existingProcess.listeners.get(listenerId);
      if (oldListenerInfo && oldListenerInfo.disposable) {
        oldListenerInfo.disposable.dispose();
        existingProcess.listeners.delete(listenerId);
      }
      
      // Create new listener
      const newListener = (data: string) => {
        sender.send(`shell:output:${processId}`, data);
      };
      
      // Attach new listener and store with disposable
      const disposable = existingProcess.pty.onData(newListener);
      existingProcess.listeners.set(listenerId, { handler: newListener, disposable });
      
      return { success: true, processId, isNew: false };
    }

    try {
      // Determine shell based on platform
      const shell = process.platform === 'win32' 
        ? 'powershell.exe' 
        : process.env.SHELL || '/bin/bash';

      // Create PTY instance
      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: cols || 80,
        rows: rows || 30,
        cwd: worktreePath,
        env: process.env
      });

      // Create process with listeners map
      const shellProcess: ShellProcess = {
        pty: ptyProcess,
        worktreePath,
        processId,
        listeners: new Map()
      };

      // Create initial listener for this sender
      const listenerId = sender.id.toString();
      const dataListener = (data: string) => {
        sender.send(`shell:output:${processId}`, data);
      };
      
      const disposable = ptyProcess.onData(dataListener);
      shellProcess.listeners.set(listenerId, { handler: dataListener, disposable });
      
      this.processes.set(processId, shellProcess);

      // Handle PTY exit
      ptyProcess.onExit((exitCode) => {
        sender.send(`shell:exit:${processId}`, exitCode.exitCode);
        this.processes.delete(processId);
      });

      // Log process creation

      return { success: true, processId, isNew: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to start PTY' 
      };
    }
  }

  private async writeToProcess(processId: string, data: string) {
    const process = this.processes.get(processId);
    if (!process || !process.pty) {
      return { success: false, error: 'PTY not found' };
    }

    try {
      process.pty.write(data);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to write to PTY' 
      };
    }
  }

  private async resizeProcess(processId: string, cols: number, rows: number) {
    const process = this.processes.get(processId);
    if (!process || !process.pty) {
      return { success: false, error: 'PTY not found' };
    }

    try {
      process.pty.resize(cols, rows);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to resize PTY' 
      };
    }
  }

  private async getProcessBuffer(processId: string) {
    const process = this.processes.get(processId);
    if (!process || !process.pty) {
      return { success: false, error: 'PTY not found' };
    }

    // Note: node-pty doesn't provide direct buffer access
    // Buffer management should be handled on the renderer side
    return { success: true, buffer: null };
  }

  // Clean up all processes on app quit
  public cleanup() {
    for (const [, shell] of this.processes) {
      try {
        // Clean up all listeners
        for (const [, listenerInfo] of shell.listeners) {
          if (listenerInfo.disposable) {
            listenerInfo.disposable.dispose();
          }
        }
        shell.listeners.clear();
        shell.pty.kill();
      } catch (error) {
        // Process might already be dead
      }
    }
  }
}

export const shellProcessManager = new ShellProcessManager();