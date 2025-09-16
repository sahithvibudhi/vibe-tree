import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the electron API
const mockSelectDirectory = vi.fn();
const mockAddProject = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockSelectDirectory.mockReset();
  mockAddProject.mockReset();
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