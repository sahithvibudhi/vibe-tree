import express, { type Express } from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { setupWebSocketHandlers, type SessionHooks } from './api/websocket';
import { setupRestRoutes } from './api/rest';
import { ShellManager, type PtySpawn, type ShellSettings } from './services/ShellManager';
import { AgentStateTracker } from './services/AgentStateTracker';
import { AuthService } from './auth/AuthService';
import type { ServerConfig } from './config';

export interface CreateServerOptions {
  config: ServerConfig;
  /** node-pty spawn, injected by the host (standalone server or Electron main) */
  spawn: PtySpawn;
  /** Directory with a built web app to serve as the UI (single-process deploys) */
  staticDir?: string;
  hooks?: SessionHooks;
  getShellSettings?: () => ShellSettings;
}

export interface VibeTreeServer {
  app: Express;
  httpServer: http.Server;
  wss: WebSocketServer;
  shellManager: ShellManager;
  authService: AuthService;
  listen: () => Promise<{ port: number; host: string }>;
  close: () => Promise<void>;
}

export function createVibeTreeServer(options: CreateServerOptions): VibeTreeServer {
  const { config, spawn, staticDir, hooks, getShellSettings } = options;

  const app = express();
  app.use(cors());
  app.use(express.json());

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  const shellManager = new ShellManager(spawn, getShellSettings);
  const authService = new AuthService(config);
  const agentStateTracker = new AgentStateTracker();

  if (config.sessionIdleTimeoutMs > 0) {
    shellManager.startIdleCleanup(config.sessionIdleTimeoutMs);
  }

  setupRestRoutes(app, { shellManager, authService, config, agentStateTracker });
  setupWebSocketHandlers(wss, { shellManager, authService, config, hooks, agentStateTracker });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: '0.0.1' });
  });

  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir));
    // SPA fallback: anything that is not an API route serves the web app
    app.get(/^\/(?!api\/|health).*/, (req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  } else {
    app.get('/', (req, res) => {
      res.json({
        name: 'VibeTree Server',
        version: '0.0.1',
        endpoints: {
          websocket: `ws://${req.headers.host}`,
          health: '/health',
          config: '/api/config',
          api: '/api/*'
        }
      });
    });
  }

  return {
    app,
    httpServer,
    wss,
    shellManager,
    authService,
    listen: () =>
      new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(config.port, config.host, () => {
          const address = httpServer.address();
          const port = typeof address === 'object' && address ? address.port : config.port;
          resolve({ port, host: config.host });
        });
      }),
    close: async () => {
      authService.dispose();
      await shellManager.cleanup();
      wss.clients.forEach((client) => client.terminate());
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  };
}
