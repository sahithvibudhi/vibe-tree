export interface ElectronAPI {
  git: {
    listWorktrees: (projectPath: string) => Promise<Array<{
      path: string;
      branch: string;
      head: string;
    }>>;
    addWorktree: (projectPath: string, branchName: string) => Promise<{
      path: string;
      branch: string;
    }>;
    removeWorktree: (projectPath: string, worktreePath: string, branchName: string) => Promise<{
      success: boolean;
      warning?: string;
    }>;
    status: (worktreePath: string) => Promise<Array<{
      path: string;
      status: string;
      staged: boolean;
      modified: boolean;
    }>>;
    diff: (worktreePath: string, filePath?: string) => Promise<string>;
    diffStaged: (worktreePath: string, filePath?: string) => Promise<string>;
  };
  shell: {
    start: (worktreePath: string, cols?: number, rows?: number, forceNew?: boolean, terminalId?: string) => Promise<{ success: boolean; processId?: string; isNew?: boolean; error?: string }>;
    write: (processId: string, data: string) => Promise<{ success: boolean; error?: string }>;
    resize: (processId: string, cols: number, rows: number) => Promise<{ success: boolean; error?: string }>;
    status: (processId: string) => Promise<{ running: boolean }>;
    getForegroundProcess: (processId: string) => Promise<{ pid: number | null; command: string | null }>;
    getBuffer: (processId: string) => Promise<{ success: boolean; buffer?: string | null; error?: string }>;
    openExternal: (url: string) => Promise<void>;
    terminate: (processId: string) => Promise<{ success: boolean; error?: string }>;
    terminateForWorktree: (worktreePath: string) => Promise<{ success: boolean; count: number }>;
    getWorktreeSessions: () => Promise<Record<string, number>>;
    onOutput: (processId: string, callback: (data: string) => void) => () => void;
    onExit: (processId: string, callback: (code: number) => void) => () => void;
    onSessionsChanged: (callback: (sessions: Record<string, number>) => void) => () => void;
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
  recentProjects: {
    get: () => Promise<Array<{
      path: string;
      name: string;
      lastOpened: number;
    }>>;
    add: (projectPath: string) => Promise<void>;
    remove: (projectPath: string) => Promise<void>;
    clear: () => Promise<void>;
    onOpenProject: (callback: (path: string) => void) => () => void;
    onOpenRecentProject: (callback: (path: string) => void) => () => void;
  };
  terminalSettings: {
    get: () => Promise<import('./terminal-settings').TerminalSettings>;
    update: (updates: import('./terminal-settings').TerminalSettingsUpdate) => Promise<void>;
    reset: () => Promise<void>;
    getFonts: () => Promise<string[]>;
    onChange: (callback: (settings: import('./terminal-settings').TerminalSettings) => void) => () => void;
  };
  schedulerHistory: {
    get: () => Promise<Array<{
      command: string;
      delayMs: number;
      repeat: boolean;
      timestamp: number;
    }>>;
    add: (command: string, delayMs: number, repeat: boolean) => Promise<void>;
    clear: () => Promise<void>;
  };
  menu: {
    onOpenTerminalSettings: (callback: () => void) => () => void;
    onOpenSettings: (callback: () => void) => () => void;
  };
  utils: {
    getPathForFile: (file: File) => string;
  };
  // General notification APIs - can be used by any feature
  notification: {
    getSettings: () => Promise<import('./notification-settings').NotificationSettings>;
    updateSettings: (updates: import('./notification-settings').NotificationSettingsUpdate) => Promise<void>;
    resetSettings: () => Promise<void>;
    getPermissionStatus: () => Promise<import('./notification-settings').NotificationPermissionStatus>;
    openSystemSettings: () => Promise<void>;
    showTest: (type: string, worktreePath: string, branchName: string) => Promise<boolean>;
    onSettingsChanged: (callback: (settings: import('./notification-settings').NotificationSettings) => void) => () => void;
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
