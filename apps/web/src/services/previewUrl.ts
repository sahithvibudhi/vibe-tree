import { stripAnsi } from '@vibetree/core';

// Dev servers print their address on startup (Vite's "Local:", CRA,
// http.server, etc.); loopback hosts with an explicit port are a reliable
// signature for "the app under development"
const DEV_URL_REGEX = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d{2,5}(?:\/[^\s'")\]]*)?/;

export function detectDevServerUrl(chunk: string): string | null {
  const match = stripAnsi(chunk).match(DEV_URL_REGEX);
  if (!match) return null;
  // Trailing punctuation from prose ("at http://localhost:5173.") is not
  // part of the URL
  return match[0].replace(/[.,;]+$/, '');
}

/**
 * Make a detected URL reachable from THIS browser: 0.0.0.0 is a bind
 * address, not a destination, and localhost is wrong when the VibeTree
 * server (and the dev server next to it) run on another machine.
 */
export function rewriteForViewer(url: string): string {
  try {
    const parsed = new URL(url);
    const viewerHost = window.location.hostname;
    const isViewerLocal = viewerHost === 'localhost' || viewerHost === '127.0.0.1';
    if (parsed.hostname === '0.0.0.0') {
      parsed.hostname = isViewerLocal ? 'localhost' : viewerHost;
    } else if (!isViewerLocal) {
      parsed.hostname = viewerHost;
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
