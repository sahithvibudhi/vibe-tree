import { Express } from 'express';
import { ShellManager } from '../services/ShellManager';
import { AuthService } from '../auth/AuthService';
import {
  listWorktrees,
  getGitStatus,
  getGitDiff,
  addWorktree,
  removeWorktree,
  validateProjects
} from '@vibetree/core';

interface Services {
  shellManager: ShellManager;
  authService: AuthService;
}

export function setupRestRoutes(app: Express, services: Services) {
  const { shellManager, authService } = services;
  
  // Get server configuration
  app.get('/api/config', (req, res) => {
    res.json({
      projectPath: process.env.PROJECT_PATH || process.cwd(),
      version: '0.0.1'
    });
  });

  // Authentication endpoints
  
  // Get authentication configuration
  app.get('/api/auth/config', (req, res) => {
    const config = authService.getAuthConfig();
    res.json(config);
  });

  // Login endpoint
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const result = authService.login(username, password);
    
    if (result.success) {
      res.json({ sessionToken: result.sessionToken });
    } else {
      res.status(401).json({ error: result.error });
    }
  });

  // Logout endpoint
  app.post('/api/auth/logout', (req, res) => {
    // Get session token from Authorization header or query parameter
    let sessionToken: string | undefined;
    
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      sessionToken = authHeader.substring(7);
    } else if (req.query.session_token) {
      sessionToken = req.query.session_token as string;
    } else if (req.body.sessionToken) {
      sessionToken = req.body.sessionToken;
    }

    if (!sessionToken) {
      return res.status(400).json({ error: 'Session token is required' });
    }

    const success = authService.logout(sessionToken);
    
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  });

  // Generate QR code for device pairing
  app.get('/api/auth/qr', async (req, res) => {
    try {
      const port = parseInt(process.env.PORT || '3001');
      const result = await authService.generateQRCode(port);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate QR code' });
    }
  });

  // List connected devices (protected)
  app.get('/api/devices', authService.requireAuth, (req, res) => {
    const devices = authService.getConnectedDevices();
    res.json(devices);
  });

  // Disconnect a device (protected)
  app.delete('/api/devices/:deviceId', authService.requireAuth, (req, res) => {
    const success = authService.disconnectDevice(req.params.deviceId);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Device not found' });
    }
  });

  // List active shell sessions (protected)
  app.get('/api/shells', authService.requireAuth, (req, res) => {
    const sessions = shellManager.getAllSessions();
    res.json(sessions.map(s => ({
      id: s.id,
      worktreePath: s.worktreePath,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity
    })));
  });

  // Terminate a shell session (protected)
  app.delete('/api/shells/:sessionId', authService.requireAuth, async (req, res) => {
    const result = await shellManager.terminateSession(req.params.sessionId);
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json({ error: 'Session not found', ...result });
    }
  });

  // Git operations (for non-WebSocket clients) - Protected
  app.post('/api/git/worktrees', authService.requireAuth, async (req, res) => {
    try {
      const worktrees = await listWorktrees(req.body.projectPath);
      res.json(worktrees);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/git/status', authService.requireAuth, async (req, res) => {
    try {
      const status = await getGitStatus(req.body.worktreePath);
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/git/diff', authService.requireAuth, async (req, res) => {
    try {
      const diff = await getGitDiff(req.body.worktreePath, req.body.filePath);
      res.json({ diff });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/git/worktree/add', authService.requireAuth, async (req, res) => {
    try {
      const result = await addWorktree(req.body.projectPath, req.body.branchName);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.delete('/api/git/worktree', authService.requireAuth, async (req, res) => {
    try {
      const result = await removeWorktree(
        req.body.projectPath,
        req.body.worktreePath,
        req.body.branchName
      );
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Validate multiple project paths (protected)
  app.post('/api/projects/validate', authService.requireAuth, async (req, res) => {
    try {
      const { projectPaths } = req.body;
      
      if (!Array.isArray(projectPaths)) {
        return res.status(400).json({ error: 'projectPaths must be an array' });
      }
      
      if (projectPaths.length === 0) {
        return res.json([]);
      }
      
      if (projectPaths.length > 10) {
        return res.status(400).json({ error: 'Maximum 10 projects can be validated at once' });
      }
      
      const results = await validateProjects(projectPaths);
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Auto-load projects from environment variable
  app.get('/api/projects/auto-load', async (req, res) => {
    try {
      const defaultProjectsEnv = process.env.DEFAULT_PROJECTS;
      
      if (!defaultProjectsEnv || defaultProjectsEnv.trim() === '') {
        return res.json({ 
          projectPaths: [], 
          validationResults: [], 
          defaultProjectPath: null 
        });
      }
      
      // Parse comma-separated project paths
      const projectPaths = defaultProjectsEnv
        .split(',')
        .map(path => path.trim())
        .filter(path => path.length > 0);
      
      if (projectPaths.length === 0) {
        return res.json({ 
          projectPaths: [], 
          validationResults: [], 
          defaultProjectPath: null 
        });
      }
      
      if (projectPaths.length > 10) {
        return res.status(400).json({ error: 'Maximum 10 projects can be configured in DEFAULT_PROJECTS' });
      }
      
      // Validate all projects
      const validationResults = await validateProjects(projectPaths);
      
      // First valid project becomes the default
      const defaultProjectPath = validationResults.find(result => result.valid)?.path || null;
      
      res.json({
        projectPaths,
        validationResults,
        defaultProjectPath
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });
}