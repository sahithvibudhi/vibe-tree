import net from 'net';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import qrcode from 'qrcode';
import * as pty from 'node-pty';
import { createVibeTreeServer, loadConfigFromEnv } from '@vibetree/server-core';
import { getNetworkUrls, type IPty } from '@vibetree/core';

dotenv.config();

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

async function findAvailablePort(preferred: number): Promise<number> {
  if (process.env.PORT) {
    return parseInt(process.env.PORT, 10);
  }

  let port = preferred;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await isPortAvailable(port)) {
      return port;
    }
    port++;
  }

  throw new Error(`Could not find available port after 3 attempts starting from ${preferred}`);
}

function findWebDist(): string | undefined {
  const candidates = [
    path.join(__dirname, '../../web/dist'),
    path.join(__dirname, '../../../apps/web/dist')
  ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html')));
}

async function startServer() {
  const config = loadConfigFromEnv();
  config.port = await findAvailablePort(config.port);

  const staticDir = findWebDist();

  const server = createVibeTreeServer({
    config,
    spawn: pty.spawn as unknown as (shell: string, args: string[], options: unknown) => IPty,
    staticDir
  });

  const { port } = await server.listen();
  const socketUrls = getNetworkUrls(port, config.host);

  console.log('\nVibeTree server started');
  console.log('Project path:', config.projectPath);
  console.log();

  const authConfig = server.authService.getAuthConfig();
  console.log('Authentication:');
  console.log(`  Required:   ${authConfig.authRequired ? 'yes' : 'no'}`);
  console.log(`  Configured: ${authConfig.authConfigured ? 'yes' : 'no'}`);
  if (authConfig.authRequired && !authConfig.authConfigured) {
    console.log('  Warning: AUTH_REQUIRED=true but VIBETREE_USERNAME/VIBETREE_PASSWORD not set');
  }
  if (!authConfig.authRequired && config.host === '0.0.0.0') {
    console.log(
      '  Warning: auth is disabled and the server is bound to 0.0.0.0.',
      'Anyone on your network can open terminals on this machine.',
      'Set AUTH_REQUIRED=true with VIBETREE_USERNAME/VIBETREE_PASSWORD to protect it.'
    );
  }
  console.log();

  if (staticDir) {
    console.log('Web UI (served by this process):');
    console.log(`  Local:   ${socketUrls.local}`);
    console.log(`  Network: ${socketUrls.network}`);
  } else {
    let webPort = 3000;
    try {
      const webPortFile = path.join(__dirname, '../../../apps/web/.web-port');
      if (fs.existsSync(webPortFile)) {
        webPort = parseInt(fs.readFileSync(webPortFile, 'utf8').trim(), 10);
      }
    } catch {
      // fall back to the default web dev port
    }
    const webUrls = getNetworkUrls(webPort, config.host);
    console.log('Web application (run "pnpm dev:web" if it is not up):');
    console.log(`  Local:   ${webUrls.local}`);
    console.log(`  Network: ${webUrls.network}`);
  }
  console.log();
  console.log('API/WebSocket:');
  console.log(`  Local:   ${socketUrls.local}`);
  console.log(`  Network: ${socketUrls.network}`);
  console.log();

  if (config.host === '0.0.0.0') {
    const uiUrl = staticDir ? socketUrls.network : getNetworkUrls(3000, config.host).network;
    try {
      const qr = await qrcode.toString(uiUrl, { type: 'terminal', small: true });
      console.log('Scan to open on your phone:');
      console.log(qr);
      console.log(`  ${uiUrl}`);
      console.log();
    } catch (err) {
      console.error('Failed to generate QR code:', err);
    }
  }

  console.log('Press Ctrl+C to stop the server\n');

  const shutdown = async () => {
    console.log('\nShutting down...');
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
