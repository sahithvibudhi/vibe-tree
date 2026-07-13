import * as os from 'os';

/**
 * Get the local network IP address
 * @returns The first non-internal IPv4 address found
 */
export function getLocalNetworkIp(): string {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;

    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        return alias.address;
      }
    }
  }

  return 'localhost';
}

/**
 * Get all network URLs for a given port
 * @param port - The port number
 * @param host - The host to bind to (optional)
 * @returns Object with local and network URLs
 */
export function getNetworkUrls(
  port: number | string,
  host?: string
): { local: string; network: string } {
  const localUrl = `http://localhost:${port}`;

  if (host && host !== '0.0.0.0') {
    return {
      local: localUrl,
      network: `http://${host}:${port}`
    };
  }

  const networkIp = getLocalNetworkIp();
  return {
    local: localUrl,
    network: `http://${networkIp}:${port}`
  };
}
