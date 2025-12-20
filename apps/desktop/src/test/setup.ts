import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock window.electronAPI
Object.defineProperty(window, 'electronAPI', {
  writable: true,
  value: {
    schedulerHistory: {
      get: vi.fn(() => Promise.resolve([])),
      add: vi.fn(() => Promise.resolve()),
      clear: vi.fn(() => Promise.resolve()),
    },
    notification: {
      getSettings: vi.fn(() => Promise.resolve({ enabled: true })),
      updateSettings: vi.fn(() => Promise.resolve()),
      resetSettings: vi.fn(() => Promise.resolve()),
      getPermissionStatus: vi.fn(() => Promise.resolve({
        supported: true,
        authorized: true,
        authorizationStatus: 'authorized',
      })),
      openSystemSettings: vi.fn(() => Promise.resolve()),
      showTest: vi.fn(() => Promise.resolve(true)),
      onSettingsChanged: vi.fn(() => () => {}),
    },
    claudeNotification: {
      enable: vi.fn(() => Promise.resolve(true)),
      disable: vi.fn(() => Promise.resolve()),
      isEnabled: vi.fn(() => Promise.resolve(false)),
      markUserInput: vi.fn(() => Promise.resolve()),
      onClicked: vi.fn(() => () => {}),
    },
    recentProjects: {
      get: vi.fn(() => Promise.resolve([])),
      add: vi.fn(() => Promise.resolve()),
      remove: vi.fn(() => Promise.resolve()),
      clear: vi.fn(() => Promise.resolve()),
      onOpenProject: vi.fn(() => () => {}),
      onOpenRecentProject: vi.fn(() => () => {}),
    },
    shell: {
      terminateForWorktree: vi.fn(() => Promise.resolve({ success: true, count: 0 })),
    },
  },
});