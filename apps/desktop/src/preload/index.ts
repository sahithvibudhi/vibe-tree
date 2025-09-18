import { contextBridge, ipcRenderer } from 'electron';

const api = {
  git: {
    listWorktrees: (projectPath: string) => 
      ipcRenderer.invoke('git:worktree-list', projectPath),
    addWorktree: (projectPath: string, branchName: string) => 
      ipcRenderer.invoke('git:worktree-add', projectPath, branchName),
    removeWorktree: (projectPath: string, worktreePath: string, branchName: string) => 
      ipcRenderer.invoke('git:worktree-remove', projectPath, worktreePath, branchName),
    status: (worktreePath: string) =>
      ipcRenderer.invoke('git:status', worktreePath),
    diff: (worktreePath: string, filePath?: string) =>
      ipcRenderer.invoke('git:diff', worktreePath, filePath),
    diffStaged: (worktreePath: string, filePath?: string) =>
      ipcRenderer.invoke('git:diff-staged', worktreePath, filePath),
  },
  shell: {
    start: (worktreePath: string, cols?: number, rows?: number, forceNew?: boolean, terminalId?: string) => 
      ipcRenderer.invoke('shell:start', worktreePath, cols, rows, forceNew, terminalId),
    write: (processId: string, data: string) => 
      ipcRenderer.invoke('shell:write', processId, data),
    resize: (processId: string, cols: number, rows: number) => 
      ipcRenderer.invoke('shell:resize', processId, cols, rows),
    status: (processId: string) => 
      ipcRenderer.invoke('shell:status', processId),
    getBuffer: (processId: string) => 
      ipcRenderer.invoke('shell:get-buffer', processId),
    openExternal: (url: string) =>
      ipcRenderer.invoke('shell:open-external', url),
    terminate: (processId: string) =>
      ipcRenderer.invoke('shell:terminate', processId),
    onOutput: (processId: string, callback: (data: string) => void) => {
      const channel = `shell:output:${processId}`;
      const listener = (_: unknown, data: string) => callback(data);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
    onExit: (processId: string, callback: (code: number) => void) => {
      const channel = `shell:exit:${processId}`;
      const listener = (_: unknown, code: number) => callback(code);
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
  project: {
    openPath: (projectPath: string) => ipcRenderer.invoke('project:open-path', projectPath),
    openCwd: () => ipcRenderer.invoke('project:open-cwd')
  },
  recentProjects: {
    get: () => ipcRenderer.invoke('recent-projects:get'),
    add: (projectPath: string) => ipcRenderer.invoke('recent-projects:add', projectPath),
    remove: (projectPath: string) => ipcRenderer.invoke('recent-projects:remove', projectPath),
    clear: () => ipcRenderer.invoke('recent-projects:clear'),
    onOpenProject: (callback: (path: string) => void) => {
      const listener = (_: unknown, path: string) => callback(path);
      ipcRenderer.on('project:open', listener);
      return () => ipcRenderer.removeListener('project:open', listener);
    },
    onOpenRecentProject: (callback: (path: string) => void) => {
      const listener = (_: unknown, path: string) => callback(path);
      ipcRenderer.on('project:open-recent', listener);
      return () => ipcRenderer.removeListener('project:open-recent', listener);
    },
  },
  terminalSettings: {
    get: () => ipcRenderer.invoke('terminal-settings:get'),
    update: (updates: Record<string, unknown>) => ipcRenderer.invoke('terminal-settings:update', updates),
    reset: () => ipcRenderer.invoke('terminal-settings:reset'),
    getFonts: () => ipcRenderer.invoke('terminal-settings:get-fonts'),
    onChange: (callback: (settings: Record<string, unknown>) => void) => {
      const listener = (_: unknown, settings: Record<string, unknown>) => callback(settings);
      ipcRenderer.on('terminal-settings:changed', listener);
      return () => ipcRenderer.removeListener('terminal-settings:changed', listener);
    }
  },
  menu: {
    onOpenTerminalSettings: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('menu:open-terminal-settings', listener);
      return () => ipcRenderer.removeListener('menu:open-terminal-settings', listener);
    }
  }
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;