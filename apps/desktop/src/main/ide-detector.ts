import { ipcMain } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execAsync = promisify(exec);

interface IDE {
  name: string;
  command: string;
  icon?: string;
}

class IDEDetector {
  private detectedIDEs: IDE[] = [];
  private _initialized = false;

  constructor() {
    // Defer initialization until first use
  }

  private ensureInitialized() {
    if (!this._initialized) {
      this._initialized = true;
      this.setupIpcHandlers();
      this.detectIDEs();
    }
  }

  private setupIpcHandlers() {
    ipcMain.handle('ide:detect', async () => {
      this.ensureInitialized();
      if (this.detectedIDEs.length === 0) {
        await this.detectIDEs();
      }
      return this.detectedIDEs;
    });

    ipcMain.handle('ide:open', async (_, ideName: string, worktreePath: string) => {
      this.ensureInitialized();
      const ide = this.detectedIDEs.find(i => i.name === ideName);
      if (!ide) {
        return { success: false, error: 'IDE not found' };
      }

      try {
        const command = `${ide.command} "${worktreePath}"`;
        
        if (process.platform === 'win32') {
          await execAsync(command);
        } else {
          await execAsync(command);
        }
        
        return { success: true };
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Failed to open IDE' 
        };
      }
    });
  }

  private async detectIDEs() {
    this.detectedIDEs = [];

    if (process.platform === 'darwin') {
      await this.detectMacIDEs();
    } else if (process.platform === 'win32') {
      await this.detectWindowsIDEs();
    } else {
      await this.detectLinuxIDEs();
    }
  }

  private async detectMacIDEs() {
    const ides = [
      { 
        name: 'Cursor', 
        path: '/Applications/Cursor.app',
        command: 'open -a Cursor'
      },
      { 
        name: 'Visual Studio Code', 
        path: '/Applications/Visual Studio Code.app',
        command: 'open -a "Visual Studio Code"'
      },
      { 
        name: 'VSCode', 
        path: '/Applications/VSCode.app',
        command: 'open -a VSCode'
      }
    ];

    for (const ide of ides) {
      if (fs.existsSync(ide.path)) {
        this.detectedIDEs.push({
          name: ide.name,
          command: ide.command
        });
      }
    }

    // Also check for command line tools
    try {
      await execAsync('which cursor');
      if (!this.detectedIDEs.find(ide => ide.name === 'Cursor')) {
        this.detectedIDEs.push({
          name: 'Cursor',
          command: 'cursor'
        });
      }
    } catch {
      // IDE not found, continue
    }

    try {
      await execAsync('which code');
      if (!this.detectedIDEs.find(ide => ide.name.includes('Visual Studio Code'))) {
        this.detectedIDEs.push({
          name: 'Visual Studio Code',
          command: 'code'
        });
      }
    } catch {
      // IDE not found, continue
    }
  }

  private async detectWindowsIDEs() {
    const commonPaths = [
      {
        name: 'Cursor',
        paths: [
          process.env.LOCALAPPDATA + '\\Programs\\cursor\\Cursor.exe',
          'C:\\Program Files\\Cursor\\Cursor.exe'
        ]
      },
      {
        name: 'Visual Studio Code',
        paths: [
          process.env.LOCALAPPDATA + '\\Programs\\Microsoft VS Code\\Code.exe',
          'C:\\Program Files\\Microsoft VS Code\\Code.exe',
          'C:\\Program Files (x86)\\Microsoft VS Code\\Code.exe'
        ]
      }
    ];

    for (const ide of commonPaths) {
      for (const idePath of ide.paths) {
        if (idePath && fs.existsSync(idePath)) {
          this.detectedIDEs.push({
            name: ide.name,
            command: `"${idePath}"`
          });
          break;
        }
      }
    }

    // Check PATH
    try {
      await execAsync('where cursor');
      if (!this.detectedIDEs.find(ide => ide.name === 'Cursor')) {
        this.detectedIDEs.push({
          name: 'Cursor',
          command: 'cursor'
        });
      }
    } catch {
      // IDE not found, continue
    }

    try {
      await execAsync('where code');
      if (!this.detectedIDEs.find(ide => ide.name.includes('Visual Studio Code'))) {
        this.detectedIDEs.push({
          name: 'Visual Studio Code',
          command: 'code'
        });
      }
    } catch {
      // IDE not found, continue
    }
  }

  private async detectLinuxIDEs() {
    // Check for command line tools
    try {
      await execAsync('which cursor');
      this.detectedIDEs.push({
        name: 'Cursor',
        command: 'cursor'
      });
    } catch {
      // IDE not found, continue
    }

    try {
      await execAsync('which code');
      this.detectedIDEs.push({
        name: 'Visual Studio Code',
        command: 'code'
      });
    } catch {
      // IDE not found, continue
    }
  }
}

// Initialize IDE detector
new IDEDetector();