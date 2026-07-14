export interface ElectronAPI {
  server: {
    getEndpoint: () => Promise<{ url: string; port: number }>;
  };
  shell: {
    getForegroundProcess: (
      processId: string
    ) => Promise<{ pid: number | null; command: string | null }>;
    openExternal: (url: string) => Promise<void>;
  };
  ide: {
    detect: () => Promise<Array<{ name: string; command: string }>>;
    open: (ideName: string, worktreePath: string) => Promise<{ success: boolean; error?: string }>;
  };
  theme: {
    get: () => Promise<'light' | 'dark'>;
    onChange: (callback: (theme: 'light' | 'dark') => void) => () => void;
  };
  dialog: {
    selectDirectory: () => Promise<string | undefined>;
    showError: (title: string, message: string) => Promise<void>;
  };
  project: {
    openPath: (projectPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
    openCwd: () => Promise<{ success: boolean; path?: string; error?: string }>;
  };
  recentProjects: {
    get: () => Promise<
      Array<{
        path: string;
        name: string;
        lastOpened: number;
      }>
    >;
    add: (projectPath: string) => Promise<void>;
    remove: (projectPath: string) => Promise<void>;
    clear: () => Promise<void>;
    onOpenProject: (callback: (path: string) => void) => () => void;
    onOpenRecentProject: (callback: (path: string) => void) => () => void;
  };
  appSettings: {
    get: () => Promise<import('./app-settings').AppSettings>;
    update: (
      updates: Partial<import('./app-settings').AppSettings>
    ) => Promise<import('./app-settings').AppSettings>;
  };
  terminalSettings: {
    get: () => Promise<import('./terminal-settings').TerminalSettings>;
    update: (updates: import('./terminal-settings').TerminalSettingsUpdate) => Promise<void>;
    reset: () => Promise<void>;
    getFonts: () => Promise<string[]>;
    onChange: (
      callback: (settings: import('./terminal-settings').TerminalSettings) => void
    ) => () => void;
  };
  schedulerHistory: {
    get: () => Promise<
      Array<{
        command: string;
        delayMs: number;
        repeat: boolean;
        timestamp: number;
      }>
    >;
    add: (command: string, delayMs: number, repeat: boolean) => Promise<void>;
    clear: () => Promise<void>;
  };
  menu: {
    onOpenTerminalSettings: (callback: () => void) => () => void;
    onOpenSettings: (callback: () => void) => () => void;
    onNewWorktree: (callback: () => void) => () => void;
    onToggleView: (callback: () => void) => () => void;
    onSelectWorktreeDelta: (callback: (delta: number) => void) => () => void;
  };
  utils: {
    getPathForFile: (file: File) => string;
  };
  debug: {
    createStressTestRepo: () => Promise<{ success: boolean; path?: string; error?: string }>;
    addStressTestWorktree: (
      repoPath: string,
      index: number
    ) => Promise<{ success: boolean; path?: string; branch?: string; error?: string }>;
  };
  // General notification APIs - can be used by any feature
  notification: {
    getSettings: () => Promise<import('./notification-settings').NotificationSettings>;
    updateSettings: (
      updates: import('./notification-settings').NotificationSettingsUpdate
    ) => Promise<void>;
    resetSettings: () => Promise<void>;
    getPermissionStatus: () => Promise<
      import('./notification-settings').NotificationPermissionStatus
    >;
    openSystemSettings: () => Promise<void>;
    showTest: (type: string, worktreePath: string, branchName: string) => Promise<boolean>;
    onSettingsChanged: (
      callback: (settings: import('./notification-settings').NotificationSettings) => void
    ) => () => void;
  };
  // Claude-specific notification APIs - session tracking, state detection
  claudeNotification: {
    enable: (processId: string) => Promise<boolean>;
    disable: (processId: string) => Promise<void>;
    isEnabled: (processId: string) => Promise<boolean>;
    markUserInput: (processId: string) => Promise<void>;
    onClicked: (callback: (processId: string, worktreePath: string) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
