import { contextBridge, ipcRenderer } from 'electron';

const api = {
  git: {
    listWorktrees: (projectPath: string) => 
      ipcRenderer.invoke('git:worktree-list', projectPath),
    addWorktree: (projectPath: string, branchName: string) => 
      ipcRenderer.invoke('git:worktree-add', projectPath, branchName),
    status: (worktreePath: string) =>
      ipcRenderer.invoke('git:status', worktreePath),
    diff: (worktreePath: string, filePath?: string) =>
      ipcRenderer.invoke('git:diff', worktreePath, filePath),
    diffStaged: (worktreePath: string, filePath?: string) =>
      ipcRenderer.invoke('git:diff-staged', worktreePath, filePath),
  },
  shell: {
    start: (worktreePath: string, cols?: number, rows?: number) => 
      ipcRenderer.invoke('shell:start', worktreePath, cols, rows),
    write: (processId: string, data: string) => 
      ipcRenderer.invoke('shell:write', processId, data),
    resize: (processId: string, cols: number, rows: number) => 
      ipcRenderer.invoke('shell:resize', processId, cols, rows),
    status: (processId: string) => 
      ipcRenderer.invoke('shell:status', processId),
    getBuffer: (processId: string) => 
      ipcRenderer.invoke('shell:get-buffer', processId),
    onOutput: (processId: string, callback: (data: string) => void) => {
      const channel = `shell:output:${processId}`;
      const listener = (_: any, data: string) => callback(data);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
    onExit: (processId: string, callback: (code: number) => void) => {
      const channel = `shell:exit:${processId}`;
      const listener = (_: any, code: number) => callback(code);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
  },
  ide: {
    detect: () => ipcRenderer.invoke('ide:detect'),
    open: (ideName: string, worktreePath: string) => 
      ipcRenderer.invoke('ide:open', ideName, worktreePath),
  },
  theme: {
    get: () => ipcRenderer.invoke('theme:get'),
    onChange: (callback: (theme: 'light' | 'dark') => void) => {
      ipcRenderer.on('theme:changed', (_, theme) => callback(theme));
    },
  },
  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:select-directory')
  },
  notifications: {
    onNotification: (callback: (notification: {
      type: string;
      worktree: string;
      projectName: string;
      message?: string;
    }) => void) => {
      ipcRenderer.on('notification', (_, notification) => callback(notification));
    },
    onFocusWorktree: (callback: (worktreePath: string) => void) => {
      ipcRenderer.on('focus-worktree', (_, worktreePath) => callback(worktreePath));
    }
  }
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;