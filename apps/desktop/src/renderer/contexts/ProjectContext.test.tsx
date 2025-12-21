import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { ProjectProvider, useProjects } from './ProjectContext';
import { ReactNode } from 'react';

// Track the notification click callback
let notificationClickCallback: ((processId: string, worktreePath: string) => void) | null = null;

// Mock the electronAPI
beforeEach(() => {
  vi.clearAllMocks();
  notificationClickCallback = null;

  // Mock recentProjects
  (window.electronAPI.recentProjects.onOpenProject as ReturnType<typeof vi.fn>).mockImplementation(() => () => {});
  (window.electronAPI.recentProjects.onOpenRecentProject as ReturnType<typeof vi.fn>).mockImplementation(() => () => {});
  (window.electronAPI.recentProjects.add as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

  // Mock claudeNotification.onClicked to capture the callback
  (window.electronAPI.claudeNotification.onClicked as ReturnType<typeof vi.fn>).mockImplementation((callback) => {
    notificationClickCallback = callback;
    return () => {
      notificationClickCallback = null;
    };
  });

  // Mock shell.terminateForWorktree
  (window.electronAPI as any).shell = {
    ...(window.electronAPI as any).shell,
    terminateForWorktree: vi.fn().mockResolvedValue({ success: true, count: 0 }),
  };
});

// Test component to access context
function TestComponent({ onContext }: { onContext: (ctx: ReturnType<typeof useProjects>) => void }) {
  const context = useProjects();
  onContext(context);
  return null;
}

// Wrapper for rendering with provider
function renderWithProvider(children: ReactNode) {
  return render(<ProjectProvider>{children}</ProjectProvider>);
}

describe('ProjectContext', () => {
  describe('Notification Click Handler', () => {
    it('should register notification click listener on mount', () => {
      renderWithProvider(<div>Test</div>);

      expect(window.electronAPI.claudeNotification.onClicked).toHaveBeenCalled();
      expect(notificationClickCallback).not.toBeNull();
    });

    it('should switch to correct project when notification is clicked', async () => {
      let context: ReturnType<typeof useProjects> | null = null;

      renderWithProvider(
        <TestComponent onContext={(ctx) => { context = ctx; }} />
      );

      // Add a project
      act(() => {
        context!.addProject('/path/to/project1');
      });

      // Verify project was added
      expect(context!.projects).toHaveLength(1);
      expect(context!.activeProjectId).toBe(context!.projects[0].id);

      // Add worktrees to the project
      act(() => {
        context!.updateProjectWorktrees(context!.projects[0].id, [
          { path: '/path/to/project1', branch: 'main', head: 'abc123' },
          { path: '/path/to/project1-feature', branch: 'feature', head: 'def456' },
        ]);
      });

      // Add a second project
      act(() => {
        context!.addProject('/path/to/project2');
      });

      // Now project2 should be active
      expect(context!.projects).toHaveLength(2);
      const project1Id = context!.projects[0].id;
      const project2Id = context!.projects[1].id;
      expect(context!.activeProjectId).toBe(project2Id);

      // Simulate notification click for project1's worktree
      act(() => {
        notificationClickCallback!('process-123', '/path/to/project1-feature');
      });

      // Should switch to project1 and select the worktree
      await waitFor(() => {
        expect(context!.activeProjectId).toBe(project1Id);
        expect(context!.projects[0].selectedWorktree).toBe('/path/to/project1-feature');
      });
    });

    it('should switch to project when notification clicked with main project path', async () => {
      let context: ReturnType<typeof useProjects> | null = null;

      renderWithProvider(
        <TestComponent onContext={(ctx) => { context = ctx; }} />
      );

      // Add two projects
      act(() => {
        context!.addProject('/path/to/project1');
        context!.addProject('/path/to/project2');
      });

      const project1Id = context!.projects[0].id;
      expect(context!.activeProjectId).toBe(context!.projects[1].id); // project2 is active

      // Simulate notification click for project1's main path
      act(() => {
        notificationClickCallback!('process-123', '/path/to/project1');
      });

      // Should switch to project1
      await waitFor(() => {
        expect(context!.activeProjectId).toBe(project1Id);
      });
    });

    it('should not change state when notification clicked for unknown worktree', async () => {
      let context: ReturnType<typeof useProjects> | null = null;

      renderWithProvider(
        <TestComponent onContext={(ctx) => { context = ctx; }} />
      );

      // Add a project
      act(() => {
        context!.addProject('/path/to/project1');
      });

      const originalActiveId = context!.activeProjectId;

      // Simulate notification click for unknown path
      act(() => {
        notificationClickCallback!('process-123', '/unknown/path');
      });

      // State should remain unchanged
      expect(context!.activeProjectId).toBe(originalActiveId);
    });

    it('should unsubscribe from notification clicks on unmount', () => {
      const { unmount } = renderWithProvider(<div>Test</div>);

      expect(notificationClickCallback).not.toBeNull();

      unmount();

      // Callback should be cleared by unsubscribe
      expect(notificationClickCallback).toBeNull();
    });

    it('should handle multiple worktrees and select the correct one', async () => {
      let context: ReturnType<typeof useProjects> | null = null;

      renderWithProvider(
        <TestComponent onContext={(ctx) => { context = ctx; }} />
      );

      // Add a project with multiple worktrees
      act(() => {
        context!.addProject('/path/to/project');
      });

      act(() => {
        context!.updateProjectWorktrees(context!.projects[0].id, [
          { path: '/path/to/project', branch: 'main', head: 'abc123' },
          { path: '/path/to/project-wt1', branch: 'feature-1', head: 'def456' },
          { path: '/path/to/project-wt2', branch: 'feature-2', head: 'ghi789' },
        ]);
      });

      // Initially no worktree selected
      expect(context!.projects[0].selectedWorktree).toBeNull();

      // Click notification for feature-2 worktree
      act(() => {
        notificationClickCallback!('process-123', '/path/to/project-wt2');
      });

      await waitFor(() => {
        expect(context!.projects[0].selectedWorktree).toBe('/path/to/project-wt2');
      });

      // Click notification for feature-1 worktree
      act(() => {
        notificationClickCallback!('process-456', '/path/to/project-wt1');
      });

      await waitFor(() => {
        expect(context!.projects[0].selectedWorktree).toBe('/path/to/project-wt1');
      });
    });
  });

  describe('Basic Project Operations', () => {
    it('should add project and set it as active', () => {
      let context: ReturnType<typeof useProjects> | null = null;

      renderWithProvider(
        <TestComponent onContext={(ctx) => { context = ctx; }} />
      );

      expect(context!.projects).toHaveLength(0);

      act(() => {
        context!.addProject('/path/to/project');
      });

      expect(context!.projects).toHaveLength(1);
      expect(context!.projects[0].path).toBe('/path/to/project');
      expect(context!.projects[0].name).toBe('project');
      expect(context!.activeProjectId).toBe(context!.projects[0].id);
    });

    it('should not duplicate project when adding same path', () => {
      let context: ReturnType<typeof useProjects> | null = null;

      renderWithProvider(
        <TestComponent onContext={(ctx) => { context = ctx; }} />
      );

      // Add project first time
      act(() => {
        context!.addProject('/path/to/project');
      });

      expect(context!.projects).toHaveLength(1);

      // Try to add same project again
      act(() => {
        context!.addProject('/path/to/project');
      });

      // Should still have only 1 project
      expect(context!.projects).toHaveLength(1);
    });

    it('should switch active project', () => {
      let context: ReturnType<typeof useProjects> | null = null;

      renderWithProvider(
        <TestComponent onContext={(ctx) => { context = ctx; }} />
      );

      act(() => {
        context!.addProject('/path/to/project1');
      });

      act(() => {
        context!.addProject('/path/to/project2');
      });

      const project1Id = context!.projects[0].id;
      const project2Id = context!.projects[1].id;

      expect(context!.activeProjectId).toBe(project2Id);

      act(() => {
        context!.setActiveProject(project1Id);
      });

      expect(context!.activeProjectId).toBe(project1Id);
    });

    it('should update project worktrees', () => {
      let context: ReturnType<typeof useProjects> | null = null;

      renderWithProvider(
        <TestComponent onContext={(ctx) => { context = ctx; }} />
      );

      act(() => {
        context!.addProject('/path/to/project');
      });

      const projectId = context!.projects[0].id;

      act(() => {
        context!.updateProjectWorktrees(projectId, [
          { path: '/path/to/project', branch: 'main', head: 'abc123' },
          { path: '/path/to/project-wt', branch: 'feature', head: 'def456' },
        ]);
      });

      expect(context!.projects[0].worktrees).toHaveLength(2);
      expect(context!.projects[0].worktrees[0].branch).toBe('main');
      expect(context!.projects[0].worktrees[1].branch).toBe('feature');
    });

    it('should set selected worktree', () => {
      let context: ReturnType<typeof useProjects> | null = null;

      renderWithProvider(
        <TestComponent onContext={(ctx) => { context = ctx; }} />
      );

      act(() => {
        context!.addProject('/path/to/project');
      });

      const projectId = context!.projects[0].id;

      expect(context!.projects[0].selectedWorktree).toBeNull();

      act(() => {
        context!.setSelectedWorktree(projectId, '/path/to/worktree');
      });

      expect(context!.projects[0].selectedWorktree).toBe('/path/to/worktree');
    });
  });
});
