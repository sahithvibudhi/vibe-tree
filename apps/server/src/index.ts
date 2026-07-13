import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import qrcode from 'qrcode';
import { setupWebSocketHandlers } from './api/websocket';
import { setupRestRoutes } from './api/rest';
import { ShellManager } from './services/ShellManager';
import { AuthService } from './auth/AuthService';
import { getNetworkUrls } from '@vibetree/core';

dotenv.config();

// Function to check if port is available
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.once('close', () => resolve(true));
      server.close();
    });
    server.on('error', () => resolve(false));
  });
}

// Function to find an available port with simple retry logic
async function findAvailablePort(): Promise<number> {
  if (process.env.PORT) {
    return parseInt(process.env.PORT);
  }

  // Start with default port 3002 and try sequential ports if needed
  let port = 3002;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (await isPortAvailable(port)) {
      return port;
    }
    port++; // Try next port
  }

  // If all 3 attempts fail, let the server fail with a clear error
  throw new Error(`Could not find available port after 3 attempts starting from ${port - 3}`);
}

async function startServer() {
  const app = express();
  const PORT = await findAvailablePort();
  const HOST = process.env.HOST || '0.0.0.0';
  const PROJECT_PATH = process.env.PROJECT_PATH || process.cwd();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Create HTTP server
  const server = http.createServer(app);

  // Create WebSocket server
  const wss = new WebSocketServer({ server });

  // Initialize services
  const shellManager = new ShellManager();
  const authService = new AuthService();

  // Setup REST routes
  setupRestRoutes(app, { shellManager, authService });

  // Setup WebSocket handlers
  setupWebSocketHandlers(wss, { shellManager, authService });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: '0.0.1' });
  });

  // Root endpoint - provide server info
  app.get('/', (req, res) => {
    res.json({
      name: 'VibeTree Socket Server',
      version: '0.0.1',
      endpoints: {
        websocket: `ws://${req.headers.host}`,
        health: '/health',
        config: '/api/config',
        api: '/api/*'
      },
      webApp: {
        url: 'http://localhost:3000',
        note: 'Run "pnpm dev:web" to start the web interface'
      }
    });
  });

  // Start server
  server.listen(parseInt(PORT.toString()), HOST, async () => {
    const socketUrls = getNetworkUrls(PORT, HOST);

    // Try to read web port from file, fallback to 3000
    let webPort = 3000;
    try {
      const webPortFile = path.join(__dirname, '../../../apps/web/.web-port');
      if (fs.existsSync(webPortFile)) {
        webPort = parseInt(fs.readFileSync(webPortFile, 'utf8').trim());
      }
    } catch (error) {
      console.warn('Could not read web port file, using default port 3000');
    }

    const webUrls = getNetworkUrls(webPort, HOST);

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║               VibeTree Services Started                   ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    console.log('📁 Project Path:', PROJECT_PATH);
    console.log();

    // Display authentication status
    const authConfig = authService.getAuthConfig();
    console.log('🔐 Authentication:');
    console.log(`   Required:   ${authConfig.authRequired ? 'Yes' : 'No'}`);
    console.log(`   Configured: ${authConfig.authConfigured ? 'Yes' : 'No'}`);
    if (authConfig.authRequired && !authConfig.authConfigured) {
      console.log('   ⚠️  Warning: AUTH_REQUIRED=true but USERNAME/PASSWORD not set');
    }
    console.log();

    console.log('🌐 Web Application (UI):');
    console.log(`   Local:   ${webUrls.local}`);
    console.log(`   Network: ${webUrls.network}`);
    console.log();

    console.log('🔌 Socket Server (API/WebSocket):');
    console.log(`   Local:   ${socketUrls.local}`);
    console.log(`   Network: ${socketUrls.network}`);
    console.log(`   WS:      ws://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log();

    // Generate QR code for mobile access to web app
    if (HOST === '0.0.0.0' || !HOST) {
      try {
        const qr = await qrcode.toString(webUrls.network, { type: 'terminal', small: true });
        console.log('📱 Scan QR code to access Web UI from mobile:\n');
        console.log(qr);
        console.log(`   ${webUrls.network}`);
        console.log();
      } catch (err) {
        console.error('Failed to generate QR code:', err);
      }
    }

    console.log('ℹ️  Make sure the web app is running: pnpm dev:web');
    console.log('Press Ctrl+C to stop the server\n');
  });
}

// Start the server
startServer().catch(console.error);
