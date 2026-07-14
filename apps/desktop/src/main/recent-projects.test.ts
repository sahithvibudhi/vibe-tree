import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/vibetree-test')
  }
}));

// Mock fs
vi.mock('fs');

describe('RecentProjectsManager', () => {
  const mockFs = vi.mocked(fs);

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Mock default filesystem behavior
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockReturnValue('[]');
    mockFs.writeFileSync.mockImplementation(() => {});
    mockFs.mkdirSync.mockImplementation(() => undefined);
  });

  afterEach(() => {
    // Clean up any loaded modules to reset the manager instance
    vi.resetModules();
  });

  it('should initialize with empty recent projects when no file exists', async () => {
    mockFs.existsSync.mockReturnValue(false);

    const { recentProjectsManager } = await import('./recent-projects');
    const recentProjects = recentProjectsManager.getRecentProjects();

    expect(recentProjects).toEqual([]);
  });

  it('should load existing recent projects from file', async () => {
    const testProjects = [
      { path: '/path/to/project1', name: 'project1', lastOpened: 1000 },
      { path: '/path/to/project2', name: 'project2', lastOpened: 2000 }
    ];

    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(testProjects));

    const { recentProjectsManager } = await import('./recent-projects');
    const recentProjects = recentProjectsManager.getRecentProjects();

    expect(recentProjects).toHaveLength(2);
    expect(recentProjects[0]).toEqual(testProjects[1]); // Most recent first
    expect(recentProjects[1]).toEqual(testProjects[0]);
  });

  it('should add new project to recent projects', async () => {
    mockFs.existsSync.mockReturnValue(false);

    const { recentProjectsManager } = await import('./recent-projects');

    recentProjectsManager.addRecentProject('/path/to/new-project');

    const recentProjects = recentProjectsManager.getRecentProjects();
    expect(recentProjects).toHaveLength(1);
    expect(recentProjects[0].path).toBe('/path/to/new-project');
    expect(recentProjects[0].name).toBe('new-project');
    expect(recentProjects[0].lastOpened).toBeGreaterThan(0);

    // Verify save was called
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      path.join('/tmp/vibetree-test', 'recent-projects.json'),
      expect.any(String)
    );
  });

  it('should move existing project to front when re-added', async () => {
    const existingProjects = [
      { path: '/path/to/project1', name: 'project1', lastOpened: 1000 },
      { path: '/path/to/project2', name: 'project2', lastOpened: 2000 }
    ];

    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(existingProjects));

    const { recentProjectsManager } = await import('./recent-projects');

    // Re-add project1 - should move it to front with updated timestamp
    recentProjectsManager.addRecentProject('/path/to/project1');

    const recentProjects = recentProjectsManager.getRecentProjects();
    expect(recentProjects).toHaveLength(2);
    expect(recentProjects[0].path).toBe('/path/to/project1');
    expect(recentProjects[0].lastOpened).toBeGreaterThan(2000);
    expect(recentProjects[1].path).toBe('/path/to/project2');
  });

  it('should limit recent projects to maximum of 10', async () => {
    // Create 12 projects
    const projects = Array.from({ length: 12 }, (_, i) => ({
      path: `/path/to/project${i}`,
      name: `project${i}`,
      lastOpened: 1000 + i
    }));

    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(projects));

    const { recentProjectsManager } = await import('./recent-projects');

    const recentProjects = recentProjectsManager.getRecentProjects();
    expect(recentProjects).toHaveLength(10); // Should be limited to 10

    // Should keep the most recent 10
    expect(recentProjects[0].name).toBe('project11');
    expect(recentProjects[9].name).toBe('project2');
  });

  it('should remove project from recent projects', async () => {
    const testProjects = [
      { path: '/path/to/project1', name: 'project1', lastOpened: 1000 },
      { path: '/path/to/project2', name: 'project2', lastOpened: 2000 }
    ];

    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(testProjects));

    const { recentProjectsManager } = await import('./recent-projects');

    recentProjectsManager.removeRecentProject('/path/to/project1');

    const recentProjects = recentProjectsManager.getRecentProjects();
    expect(recentProjects).toHaveLength(1);
    expect(recentProjects[0].path).toBe('/path/to/project2');

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      path.join('/tmp/vibetree-test', 'recent-projects.json'),
      expect.any(String)
    );
  });

  it('should clear all recent projects', async () => {
    const testProjects = [
      { path: '/path/to/project1', name: 'project1', lastOpened: 1000 },
      { path: '/path/to/project2', name: 'project2', lastOpened: 2000 }
    ];

    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(testProjects));

    const { recentProjectsManager } = await import('./recent-projects');

    recentProjectsManager.clearRecentProjects();

    const recentProjects = recentProjectsManager.getRecentProjects();
    expect(recentProjects).toHaveLength(0);

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      path.join('/tmp/vibetree-test', 'recent-projects.json'),
      '[]'
    );
  });

  it('should handle corrupted file gracefully', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('invalid json');

    const { recentProjectsManager } = await import('./recent-projects');

    // Should not throw and return empty array
    const recentProjects = recentProjectsManager.getRecentProjects();
    expect(recentProjects).toEqual([]);
  });

  it('should filter out invalid project entries', async () => {
    const mixedProjects = [
      { path: '/valid/project1', name: 'project1', lastOpened: 1000 }, // Valid
      { path: 123, name: 'invalid', lastOpened: 2000 }, // Invalid path type
      { path: '/valid/project2', name: 123, lastOpened: 3000 }, // Invalid name type
      { path: '/valid/project3', name: 'project3', lastOpened: 'invalid' }, // Invalid timestamp type
      { path: '/valid/project4', name: 'project4', lastOpened: 4000 } // Valid
    ];

    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(mixedProjects));

    const { recentProjectsManager } = await import('./recent-projects');

    const recentProjects = recentProjectsManager.getRecentProjects();
    expect(recentProjects).toHaveLength(2);
    expect(
      recentProjects.every(
        (p) =>
          typeof p.path === 'string' &&
          typeof p.name === 'string' &&
          typeof p.lastOpened === 'number'
      )
    ).toBe(true);
  });

  it('should create directory if it does not exist when saving', async () => {
    mockFs.existsSync.mockReturnValue(false);

    const { recentProjectsManager } = await import('./recent-projects');

    recentProjectsManager.addRecentProject('/path/to/project');

    expect(mockFs.mkdirSync).toHaveBeenCalledWith('/tmp/vibetree-test', { recursive: true });
    expect(mockFs.writeFileSync).toHaveBeenCalled();
  });
});
