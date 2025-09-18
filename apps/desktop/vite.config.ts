import { defineConfig, ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';

// Plugin to capture the actual port Vite uses
function portCapturePlugin() {
  return {
    name: 'port-capture',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__vite_port_capture', (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        // This won't be called, but ensures the plugin is active
        next();
      });

      // Hook into the server listening event
      server.httpServer?.on('listening', () => {
        const address = server.httpServer.address();
        if (address && typeof address === 'object') {
          const actualPort = address.port;
          fs.writeFileSync('.dev-port', actualPort.toString());
          console.log(`✓ Dev server started on port ${actualPort}, saved to .dev-port`);
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), portCapturePlugin()],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
    },
  },
  server: {
    port: Math.floor(Math.random() * 1000) + 3000,
    strictPort: false, // Allow Vite to find alternative ports if the random port is taken
  },
  define: {
    'process.env.DEBUG_LAYOUT': JSON.stringify(process.env.DEBUG_LAYOUT || 'false'),
  },
});