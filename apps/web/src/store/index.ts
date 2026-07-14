import { create } from 'zustand';
import { Worktree } from '@vibetree/core';

export type ToastVariant = 'error' | 'success' | 'info';

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface Project {
  id: string;
  path: string;
  name: string;
  worktrees: Worktree[];
  selectedWorktree: string | null;
  selectedTab: 'terminal' | 'changes';
}

interface AppState {
  // Connection state
  connected: boolean;
  connecting: boolean;
  error: string | null;

  // Project state
  projects: Project[];
  activeProjectId: string | null;

  // Terminal state
  terminalSessions: Map<string, string>; // worktreePath -> sessionId

  // Theme state
  theme: 'light' | 'dark';

  // Toast state
  toasts: Toast[];
  addToast: (message: string, variant?: ToastVariant) => void;
  dismissToast: (id: number) => void;

  // Bridges the global keyboard shortcut to the dialog owned by WorktreePanel
  newWorktreeRequestId: number;
  requestNewWorktree: () => void;

  // Paths of projects opened before, persisted so the welcome screen can
  // offer to reopen them
  recentProjects: string[];
  removeRecentProject: (path: string) => void;

  // Actions
  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setError: (error: string | null) => void;
  addProject: (path: string) => string;
  addProjects: (paths: string[]) => string[];
  removeProject: (id: string) => void;
  setActiveProject: (id: string) => void;
  updateProjectWorktrees: (id: string, worktrees: Worktree[]) => void;
  setSelectedWorktree: (projectId: string, worktreePath: string | null) => void;
  setSelectedTab: (projectId: string, tab: 'terminal' | 'changes') => void;
  getProject: (id: string) => Project | undefined;
  getActiveProject: () => Project | undefined;
  addTerminalSession: (worktreePath: string, sessionId: string) => void;
  removeTerminalSession: (worktreePath: string) => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

const RECENT_PROJECTS_KEY = 'vibetree.recentProjects';
const RECENT_PROJECTS_MAX = 10;

function loadRecentProjects(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

function persistRecentProjects(paths: string[]) {
  try {
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(paths));
  } catch {
    // Storage may be unavailable (private mode); recents are best-effort
  }
}

function rememberProjects(current: string[], paths: string[]): string[] {
  const next = [...paths, ...current.filter((p) => !paths.includes(p))].slice(
    0,
    RECENT_PROJECTS_MAX
  );
  persistRecentProjects(next);
  return next;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  connected: false,
  connecting: false,
  error: null,
  projects: [],
  activeProjectId: null,
  terminalSessions: new Map(),
  theme: 'light',
  toasts: [],

  addToast: (message, variant = 'info') => {
    const id = Date.now() + Math.random();
    set((state) => ({ toasts: [...state.toasts, { id, message, variant }] }));
  },

  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  newWorktreeRequestId: 0,
  requestNewWorktree: () => set({ newWorktreeRequestId: Date.now() }),

  recentProjects: loadRecentProjects(),
  removeRecentProject: (path) => {
    set((state) => {
      const next = state.recentProjects.filter((p) => p !== path);
      persistRecentProjects(next);
      return { recentProjects: next };
    });
  },

  // Actions
  setConnected: (connected) => set({ connected }),
  setConnecting: (connecting) => set({ connecting }),
  setError: (error) => set({ error }),

  addProject: (path: string) => {
    const state = get();
    // Check if project already exists
    const existing = state.projects.find((p) => p.path === path);
    if (existing) {
      set({ activeProjectId: existing.id });
      return existing.id;
    }

    const id = `project-${Date.now()}`;
    const name = path.split('/').pop() || 'Unnamed Project';

    const newProject: Project = {
      id,
      path,
      name,
      worktrees: [],
      selectedWorktree: null,
      selectedTab: 'terminal'
    };

    set((state) => ({
      projects: [...state.projects, newProject],
      activeProjectId: id,
      recentProjects: rememberProjects(state.recentProjects, [path])
    }));
    return id;
  },

  addProjects: (paths: string[]) => {
    const state = get();
    const newProjects: Project[] = [];
    const addedIds: string[] = [];

    paths.forEach((path) => {
      // Check if project already exists
      const existing = state.projects.find((p) => p.path === path);
      if (existing) {
        addedIds.push(existing.id);
        return;
      }

      const id = `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const name = path.split('/').pop() || 'Unnamed Project';

      const newProject: Project = {
        id,
        path,
        name,
        worktrees: [],
        selectedWorktree: null,
        selectedTab: 'terminal'
      };

      newProjects.push(newProject);
      addedIds.push(id);
    });

    if (newProjects.length > 0) {
      set((state) => ({
        projects: [...state.projects, ...newProjects],
        recentProjects: rememberProjects(
          state.recentProjects,
          newProjects.map((p) => p.path)
        )
      }));
    }

    return addedIds;
  },

  removeProject: (id: string) => {
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      activeProjectId: state.activeProjectId === id ? null : state.activeProjectId
    }));
  },

  setActiveProject: (id: string) => {
    set({ activeProjectId: id });
  },

  updateProjectWorktrees: (id: string, worktrees: Worktree[]) => {
    set((state) => ({
      projects: state.projects.map((project) =>
        project.id === id ? { ...project, worktrees } : project
      )
    }));
  },

  setSelectedWorktree: (projectId: string, worktreePath: string | null) => {
    set((state) => ({
      projects: state.projects.map((project) =>
        project.id === projectId ? { ...project, selectedWorktree: worktreePath } : project
      )
    }));
  },

  setSelectedTab: (projectId: string, tab: 'terminal' | 'changes') => {
    set((state) => ({
      projects: state.projects.map((project) =>
        project.id === projectId ? { ...project, selectedTab: tab } : project
      )
    }));
  },

  getProject: (id: string) => {
    return get().projects.find((p) => p.id === id);
  },

  getActiveProject: () => {
    const state = get();
    return state.activeProjectId
      ? state.projects.find((p) => p.id === state.activeProjectId)
      : undefined;
  },

  addTerminalSession: (worktreePath, sessionId) =>
    set((state) => {
      const sessions = new Map(state.terminalSessions);
      sessions.set(worktreePath, sessionId);
      return { terminalSessions: sessions };
    }),

  removeTerminalSession: (worktreePath) =>
    set((state) => {
      const sessions = new Map(state.terminalSessions);
      sessions.delete(worktreePath);
      return { terminalSessions: sessions };
    }),

  setTheme: (theme) => set({ theme })
}));
