import { contextBridge, ipcRenderer, webUtils } from 'electron';

/**
 * Native-only bridge. Shell and git traffic goes over WebSocket to the
 * embedded server (see renderer/services/backend.ts); this API covers the
 * things only the main process can do: OS dialogs, notifications, theme,
 * IDE launching, settings files, and menu events.
 */
const api = {
  server: {
    getEndpoint: (): Promise<{ url: string; port: number }> =>
      ipcRenderer.invoke('server:get-endpoint')
  },
  shell: {
    getForegroundProcess: (processId: string) =>
      ipcRenderer.invoke('shell:get-foreground-process', processId),
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url)
  },
  ide: {
    detect: () => ipcRenderer.invoke('ide:detect'),
    open: (ideName: string, worktreePath: string) =>
      ipcRenderer.invoke('ide:open', ideName, worktreePath)
  },
  theme: {
    get: () => ipcRenderer.invoke('theme:get'),
    onChange: (callback: (theme: 'light' | 'dark') => void) => {
      ipcRenderer.on('theme:changed', (_, theme) => callback(theme));
    }
  },
  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
    showError: (title: string, message: string) =>
      ipcRenderer.invoke('dialog:show-error', title, message)
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
    }
  },
  appSettings: {
    get: () => ipcRenderer.invoke('app-settings:get'),
    update: (updates: Record<string, unknown>) =>
      ipcRenderer.invoke('app-settings:update', updates)
  },
  terminalSettings: {
    get: () => ipcRenderer.invoke('terminal-settings:get'),
    update: (updates: Record<string, unknown>) =>
      ipcRenderer.invoke('terminal-settings:update', updates),
    reset: () => ipcRenderer.invoke('terminal-settings:reset'),
    getFonts: () => ipcRenderer.invoke('terminal-settings:get-fonts'),
    onChange: (callback: (settings: Record<string, unknown>) => void) => {
      const listener = (_: unknown, settings: Record<string, unknown>) => callback(settings);
      ipcRenderer.on('terminal-settings:changed', listener);
      return () => ipcRenderer.removeListener('terminal-settings:changed', listener);
    }
  },
  schedulerHistory: {
    get: () => ipcRenderer.invoke('scheduler-history:get'),
    add: (command: string, delayMs: number, repeat: boolean) =>
      ipcRenderer.invoke('scheduler-history:add', command, delayMs, repeat),
    clear: () => ipcRenderer.invoke('scheduler-history:clear')
  },
  menu: {
    onOpenTerminalSettings: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('menu:open-terminal-settings', listener);
      return () => ipcRenderer.removeListener('menu:open-terminal-settings', listener);
    },
    onOpenSettings: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('menu:open-settings', listener);
      return () => ipcRenderer.removeListener('menu:open-settings', listener);
    },
    onNewWorktree: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('menu:new-worktree', listener);
      return () => ipcRenderer.removeListener('menu:new-worktree', listener);
    },
    onToggleView: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('menu:toggle-view', listener);
      return () => ipcRenderer.removeListener('menu:toggle-view', listener);
    },
    onSelectWorktreeDelta: (callback: (delta: number) => void) => {
      const listener = (_: unknown, delta: number) => callback(delta);
      ipcRenderer.on('menu:select-worktree-delta', listener);
      return () => ipcRenderer.removeListener('menu:select-worktree-delta', listener);
    },
    onToggleSidebar: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('menu:toggle-sidebar', listener);
      return () => ipcRenderer.removeListener('menu:toggle-sidebar', listener);
    }
  },
  utils: {
    getPathForFile: (file: File) => {
      return webUtils.getPathForFile(file);
    }
  },
  debug: {
    createStressTestRepo: () => ipcRenderer.invoke('debug:create-stress-test-repo'),
    addStressTestWorktree: (repoPath: string, index: number) =>
      ipcRenderer.invoke('debug:add-stress-test-worktree', repoPath, index)
  },
  // General notification APIs - can be used by any feature
  notification: {
    getSettings: () => ipcRenderer.invoke('notification:get-settings'),
    updateSettings: (updates: Record<string, unknown>) =>
      ipcRenderer.invoke('notification:update-settings', updates),
    resetSettings: () => ipcRenderer.invoke('notification:reset-settings'),
    getPermissionStatus: () => ipcRenderer.invoke('notification:get-permission-status'),
    openSystemSettings: () => ipcRenderer.invoke('notification:open-system-settings'),
    showTest: (type: string, worktreePath: string, branchName: string) =>
      ipcRenderer.invoke('notification:show-test', type, worktreePath, branchName),
    onSettingsChanged: (callback: (settings: Record<string, unknown>) => void) => {
      const listener = (_: unknown, settings: Record<string, unknown>) => callback(settings);
      ipcRenderer.on('notification:settings-changed', listener);
      return () => ipcRenderer.removeListener('notification:settings-changed', listener);
    }
  },
  // Claude-specific notification APIs - session tracking, state detection
  claudeNotification: {
    enable: (processId: string) => ipcRenderer.invoke('claude-notification:enable', processId),
    disable: (processId: string) => ipcRenderer.invoke('claude-notification:disable', processId),
    isEnabled: (processId: string) =>
      ipcRenderer.invoke('claude-notification:is-enabled', processId),
    markUserInput: (processId: string) =>
      ipcRenderer.invoke('claude-notification:mark-user-input', processId),
    onClicked: (callback: (processId: string, worktreePath: string) => void) => {
      const listener = (_: unknown, processId: string, worktreePath: string) =>
        callback(processId, worktreePath);
      ipcRenderer.on('claude-notification:clicked', listener);
      return () => ipcRenderer.removeListener('claude-notification:clicked', listener);
    }
  }
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;
