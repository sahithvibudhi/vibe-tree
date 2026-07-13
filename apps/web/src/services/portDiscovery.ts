/**
 * Service to dynamically discover server port
 */

let cachedServerPort: number | null = null;

/**
 * Attempts to discover the server port by checking common ports
 */
async function discoverServerPort(): Promise<number> {
  if (cachedServerPort) {
    return cachedServerPort;
  }

  // Start with default port 3002 and check sequential ports
  let startPort = 3002;

  for (let i = 0; i < 50; i++) {
    // Check 50 sequential ports max
    const port = startPort + i;
    try {
      const response = await fetch(`http://localhost:${port}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(500) // 500ms timeout for faster discovery
      });

      if (response.ok) {
        cachedServerPort = port;
        console.log(`✓ Discovered server port: ${port}`);
        return port;
      }
    } catch (error) {
      // Continue trying next port
    }
  }

  // If discovery fails, fall back to environment variable or default
  const envPort = import.meta.env.VITE_SERVER_PORT;
  if (envPort) {
    const port = parseInt(envPort);
    console.log(`📝 Using environment server port: ${port}`);
    return port;
  }

  console.warn('⚠️ Could not discover server port, using fallback 8000');
  return 8000;
}

/**
 * Gets the server WebSocket URL, discovering the port if needed
 */
export async function getServerWebSocketUrl(): Promise<string> {
  // Check if explicitly set via environment variable
  const explicitWsUrl = import.meta.env.VITE_WS_URL;
  if (explicitWsUrl) {
    console.log(`📝 Using explicit WebSocket URL: ${explicitWsUrl}`);
    return explicitWsUrl;
  }

  // Discover the port dynamically
  const port = await discoverServerPort();

  // Determine protocol and host
  const isLocalhost =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  let wsUrl: string;
  if (isLocalhost) {
    wsUrl = `ws://localhost:${port}`;
  } else {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    wsUrl = `${protocol}//${window.location.hostname}:${port}`;
  }

  console.log(`🔌 Constructed WebSocket URL: ${wsUrl}`);
  return wsUrl;
}

/**
 * Gets the server HTTP URL, discovering the port if needed  
 */
export async function getServerHttpUrl(): Promise<string> {
  // Check if we can derive from WebSocket URL
  const explicitWsUrl = import.meta.env.VITE_WS_URL;
  if (explicitWsUrl) {
    const httpUrl = explicitWsUrl.replace('ws://', 'http://').replace('wss://', 'https://');
    console.log(`📝 Using explicit HTTP URL: ${httpUrl}`);
    return httpUrl;
  }

  // Discover the port dynamically
  const port = await discoverServerPort();

  // Determine protocol and host
  const isLocalhost =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  let httpUrl: string;
  if (isLocalhost) {
    httpUrl = `http://localhost:${port}`;
  } else {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    httpUrl = `${protocol}//${window.location.hostname}:${port}`;
  }

  console.log(`🌐 Constructed HTTP URL: ${httpUrl}`);
  return httpUrl;
}

/**
 * Reset cached server port (useful for testing or when server restarts)
 */
export function resetServerPortCache(): void {
  cachedServerPort = null;
}
