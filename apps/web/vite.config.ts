import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';

// Capture the actual port Vite picks so the server CLI can print the right
// URL and QR code even when 3000 was taken
function portCapturePlugin() {
  return {
    name: 'port-capture',
    configureServer(server: any) {
      server.httpServer?.on('listening', () => {
        const address = server.httpServer.address();
        if (address && typeof address === 'object') {
          fs.writeFileSync('.web-port', address.port.toString());
          console.log(`Web server started on port ${address.port}, saved to .web-port`);
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    portCapturePlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'VibeTree',
        short_name: 'VibeTree',
        description: 'Run AI coding agents in parallel git worktrees',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // The app shell works offline; terminal data flows over WebSocket
        // and must never be cached
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/health$/],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/[^/]+\/(api|health)\b/,
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ],
  server: {
    port: 3000,
    // Bind to all interfaces so phones on the LAN can reach the dev server
    host: '0.0.0.0',
    strictPort: false
  }
});
