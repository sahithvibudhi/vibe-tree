import type { Express } from 'express';
import {
  listWorktrees,
  getGitStatus,
  getGitDiff,
  addWorktree,
  removeWorktree,
  validateProjects,
  readProjectConfig,
  writeProjectConfig
} from '@vibetree/core';
import os from 'os';
import { ShellManager } from '../services/ShellManager';
import { AuthService } from '../auth/AuthService';
import { listDirectory, discoverRepos } from '../services/fs-browse';
import { AgentStateTracker } from '../services/AgentStateTracker';
import type { ServerConfig } from '../config';

interface Services {
  shellManager: ShellManager;
  authService: AuthService;
  config: ServerConfig;
  agentStateTracker: AgentStateTracker;
}

export function setupRestRoutes(app: Express, services: Services) {
  const { shellManager, authService, config, agentStateTracker } = services;

  app.get('/api/config', (req, res) => {
    res.json({
      projectPath: config.projectPath,
      version: '0.0.1'
    });
  });

  app.get('/api/auth/config', (req, res) => {
    res.json(authService.getAuthConfig());
  });

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

  app.post('/api/auth/logout', (req, res) => {
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

  app.get('/api/auth/qr', async (req, res) => {
    try {
      const result = await authService.generateQRCode(config.port);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate QR code' });
    }
  });

  app.get('/api/devices', authService.requireAuth, (req, res) => {
    res.json(authService.getConnectedDevices());
  });

  app.delete('/api/devices/:deviceId', authService.requireAuth, (req, res) => {
    const success = authService.disconnectDevice(req.params.deviceId);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Device not found' });
    }
  });

  app.get('/api/agent/states', authService.requireAuth, (req, res) => {
    res.json(agentStateTracker.getStates());
  });

  app.get('/api/shells', authService.requireAuth, (req, res) => {
    const sessions = shellManager.getAllSessions();
    res.json(
      sessions.map((s) => ({
        id: s.id,
        worktreePath: s.worktreePath,
        createdAt: s.createdAt,
        lastActivity: s.lastActivity
      }))
    );
  });

  app.delete('/api/shells/:sessionId', authService.requireAuth, async (req, res) => {
    const result = await shellManager.terminateSession(req.params.sessionId);
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json({ error: 'Session not found', ...result });
    }
  });

  app.post('/api/git/worktrees', authService.requireAuth, async (req, res) => {
    try {
      res.json(await listWorktrees(req.body.projectPath));
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/git/status', authService.requireAuth, async (req, res) => {
    try {
      res.json(await getGitStatus(req.body.worktreePath));
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
      res.json(await addWorktree(req.body.projectPath, req.body.branchName));
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.delete('/api/git/worktree', authService.requireAuth, async (req, res) => {
    try {
      res.json(
        await removeWorktree(req.body.projectPath, req.body.worktreePath, req.body.branchName)
      );
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Directory browsing for the project picker. Lists directories only,
  // never file contents; the same authenticated audience already has full
  // shell access, so this exposes nothing a terminal does not.
  app.get('/api/fs/list', authService.requireAuth, async (req, res) => {
    try {
      const requestedPath = typeof req.query.path === 'string' ? req.query.path : '';
      const showHidden = req.query.hidden === '1';
      res.json(await listDirectory(requestedPath, { showHidden }));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const status = code === 'ENOENT' || code === 'ENOTDIR' ? 404 : code === 'EACCES' ? 403 : 500;
      res.status(status).json({ error: (error as Error).message });
    }
  });

  app.get('/api/projects/discover', authService.requireAuth, async (req, res) => {
    try {
      const roots = config.projectsRoots.length > 0 ? config.projectsRoots : [os.homedir()];
      res.json({ roots, repos: await discoverRepos(roots) });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Per-project settings (.vibetree/config.json), currently the agent
  // command preset used by the terminal launch button
  app.get('/api/projects/config', authService.requireAuth, async (req, res) => {
    try {
      const projectPath = typeof req.query.path === 'string' ? req.query.path : '';
      if (!projectPath) return res.status(400).json({ error: 'path is required' });
      res.json(await readProjectConfig(projectPath));
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.put('/api/projects/config', authService.requireAuth, async (req, res) => {
    try {
      const { path: projectPath, agentCommand } = req.body;
      if (typeof projectPath !== 'string' || !projectPath) {
        return res.status(400).json({ error: 'path is required' });
      }
      res.json(await writeProjectConfig(projectPath, { agentCommand }));
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

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

      res.json(await validateProjects(projectPaths));
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/projects/auto-load', async (req, res) => {
    try {
      const projectPaths = config.defaultProjects;

      if (projectPaths.length === 0) {
        return res.json({
          projectPaths: [],
          validationResults: [],
          defaultProjectPath: null
        });
      }

      if (projectPaths.length > 10) {
        return res
          .status(400)
          .json({ error: 'Maximum 10 projects can be configured in DEFAULT_PROJECTS' });
      }

      const validationResults = await validateProjects(projectPaths);
      const defaultProjectPath = validationResults.find((result) => result.valid)?.path || null;

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
