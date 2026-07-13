import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
}

class RecentProjectsManager {
  private recentProjects: RecentProject[] = [];
  private readonly maxRecentProjects = 10;
  private readonly storageFile: string;

  constructor() {
    this.storageFile = path.join(app.getPath('userData'), 'recent-projects.json');
    this.loadRecentProjects();
  }

  private loadRecentProjects() {
    try {
      if (fs.existsSync(this.storageFile)) {
        const data = fs.readFileSync(this.storageFile, 'utf8');
        this.recentProjects = JSON.parse(data);
        // Validate and clean up invalid entries
        this.recentProjects = this.recentProjects.filter(
          (project) =>
            typeof project.path === 'string' &&
            typeof project.name === 'string' &&
            typeof project.lastOpened === 'number'
        );

        // Ensure we don't exceed max recent projects even after loading
        if (this.recentProjects.length > this.maxRecentProjects) {
          this.recentProjects = this.recentProjects
            .sort((a, b) => b.lastOpened - a.lastOpened)
            .slice(0, this.maxRecentProjects);
        }
      }
    } catch (error) {
      console.error('Failed to load recent projects:', error);
      this.recentProjects = [];
    }
  }

  private saveRecentProjects() {
    try {
      const dir = path.dirname(this.storageFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storageFile, JSON.stringify(this.recentProjects, null, 2));
    } catch (error) {
      console.error('Failed to save recent projects:', error);
    }
  }

  addRecentProject(projectPath: string) {
    const name = path.basename(projectPath);
    const existingIndex = this.recentProjects.findIndex((p) => p.path === projectPath);

    const project: RecentProject = {
      path: projectPath,
      name,
      lastOpened: Date.now()
    };

    if (existingIndex >= 0) {
      // Update existing project's last opened time and move to front
      this.recentProjects.splice(existingIndex, 1);
    }

    this.recentProjects.unshift(project);

    // Keep only the most recent projects
    if (this.recentProjects.length > this.maxRecentProjects) {
      this.recentProjects = this.recentProjects.slice(0, this.maxRecentProjects);
    }

    this.saveRecentProjects();
  }

  getRecentProjects(): RecentProject[] {
    // Return a copy sorted by lastOpened (most recent first)
    return [...this.recentProjects].sort((a, b) => b.lastOpened - a.lastOpened);
  }

  removeRecentProject(projectPath: string) {
    this.recentProjects = this.recentProjects.filter((p) => p.path !== projectPath);
    this.saveRecentProjects();
  }

  clearRecentProjects() {
    this.recentProjects = [];
    this.saveRecentProjects();
  }
}

export const recentProjectsManager = new RecentProjectsManager();
