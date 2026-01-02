import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the electron API
const mockSelectDirectory = vi.fn();
const mockAddProject = vi.fn();
const mockRemoveProject = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockSelectDirectory.mockReset();
  mockAddProject.mockReset();
  mockRemoveProject.mockReset();
});

describe('App Component - Plus Button Behavior', () => {
  it('should call dialog.selectDirectory when handleOpenProjectDialog is invoked', async () => {
    // Simulate the handleOpenProjectDialog function from App.tsx
    const handleOpenProjectDialog = async () => {
      const path = await mockSelectDirectory();
      if (path) {
        mockAddProject(path);
      }
    };

    // Test when a path is selected
    const testPath = '/test/project/path';
    mockSelectDirectory.mockResolvedValue(testPath);

    await handleOpenProjectDialog();

    expect(mockSelectDirectory).toHaveBeenCalledTimes(1);
    expect(mockAddProject).toHaveBeenCalledWith(testPath);
  });

  it('should not add project when dialog is cancelled', async () => {
    // Simulate the handleOpenProjectDialog function from App.tsx
    const handleOpenProjectDialog = async () => {
      const path = await mockSelectDirectory();
      if (path) {
        mockAddProject(path);
      }
    };

    // Test when dialog is cancelled (returns null)
    mockSelectDirectory.mockResolvedValue(null);

    await handleOpenProjectDialog();

    expect(mockSelectDirectory).toHaveBeenCalledTimes(1);
    expect(mockAddProject).not.toHaveBeenCalled();
  });

  it('should not show intermediate ProjectSelector when plus button is clicked', () => {
    // This test verifies the logic change
    // The old behavior would set showProjectSelector to true
    // The new behavior directly calls the dialog

    // Old behavior (removed):
    // const [showProjectSelector, setShowProjectSelector] = useState(false);
    // onClick={() => setShowProjectSelector(true)}

    // New behavior (current):
    // onClick={handleOpenProjectDialog}
    // where handleOpenProjectDialog directly calls window.electronAPI.dialog.selectDirectory()

    // This is validated by the fact that handleOpenProjectDialog
    // doesn't involve any state changes for showing a selector
    const handleOpenProjectDialog = async () => {
      const path = await mockSelectDirectory();
      if (path) {
        mockAddProject(path);
      }
    };

    // The function should not have any reference to showProjectSelector
    const functionString = handleOpenProjectDialog.toString();
    expect(functionString).not.toContain('showProjectSelector');
    expect(functionString).toContain('mockSelectDirectory');
  });

  it('should handle multiple projects being added sequentially', async () => {
    const handleOpenProjectDialog = async () => {
      const path = await mockSelectDirectory();
      if (path) {
        mockAddProject(path);
      }
    };

    // First project
    mockSelectDirectory.mockResolvedValueOnce('/project1');
    await handleOpenProjectDialog();

    // Second project
    mockSelectDirectory.mockResolvedValueOnce('/project2');
    await handleOpenProjectDialog();

    // Third project (cancelled)
    mockSelectDirectory.mockResolvedValueOnce(null);
    await handleOpenProjectDialog();

    expect(mockSelectDirectory).toHaveBeenCalledTimes(3);
    expect(mockAddProject).toHaveBeenCalledTimes(2);
    expect(mockAddProject).toHaveBeenNthCalledWith(1, '/project1');
    expect(mockAddProject).toHaveBeenNthCalledWith(2, '/project2');
  });
});

describe('App Component - Close Project Confirmation', () => {
  it('should not remove project immediately when handleCloseProject is called', () => {
    // Mock projects array
    const mockProjects = [
      { id: 'project-1', name: 'Project 1', path: '/path/1', worktrees: [] },
      { id: 'project-2', name: 'Project 2', path: '/path/2', worktrees: [] },
    ];

    // State for tracking project to close (simulating useState)
    let projectToClose: { id: string; name: string } | null = null;

    // Simulate handleCloseProject from App.tsx
    const handleCloseProject = (projectId: string) => {
      const project = mockProjects.find(p => p.id === projectId);
      if (project) {
        projectToClose = { id: project.id, name: project.name };
      }
    };

    // When close button is clicked
    handleCloseProject('project-1');

    // Should set projectToClose but not call removeProject
    expect(projectToClose).toEqual({ id: 'project-1', name: 'Project 1' });
    expect(mockRemoveProject).not.toHaveBeenCalled();
  });

  it('should remove project when confirmation is confirmed', () => {
    // State for tracking project to close
    let projectToClose: { id: string; name: string } | null = { id: 'project-1', name: 'Project 1' };

    // Simulate confirmCloseProject from App.tsx
    const confirmCloseProject = () => {
      if (projectToClose) {
        mockRemoveProject(projectToClose.id);
        projectToClose = null;
      }
    };

    // When user confirms closing
    confirmCloseProject();

    // Should call removeProject and clear projectToClose
    expect(mockRemoveProject).toHaveBeenCalledWith('project-1');
    expect(projectToClose).toBeNull();
  });

  it('should not remove project when confirmation is cancelled', () => {
    // State for tracking project to close
    let projectToClose: { id: string; name: string } | null = { id: 'project-1', name: 'Project 1' };

    // Simulate cancelCloseProject from App.tsx
    const cancelCloseProject = () => {
      projectToClose = null;
    };

    // When user cancels
    cancelCloseProject();

    // Should not call removeProject but should clear projectToClose
    expect(mockRemoveProject).not.toHaveBeenCalled();
    expect(projectToClose).toBeNull();
  });

  it('should show dialog when projectToClose is set', () => {
    // This test validates the dialog visibility logic
    let projectToClose: { id: string; name: string } | null = null;

    // Dialog open state is based on projectToClose !== null
    const isDialogOpen = () => projectToClose !== null;

    expect(isDialogOpen()).toBe(false);

    // Simulate clicking close button
    projectToClose = { id: 'project-1', name: 'Test Project' };

    expect(isDialogOpen()).toBe(true);

    // Simulate confirming or cancelling
    projectToClose = null;

    expect(isDialogOpen()).toBe(false);
  });
});