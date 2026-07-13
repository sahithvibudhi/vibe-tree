import { AuthStorage } from '@vibetree/auth';

/**
 * Get authenticated headers for API requests
 */
export function getAuthHeaders(): Record<string, string> {
  const sessionToken = AuthStorage.getSessionToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }

  return headers;
}

/**
 * Authenticated fetch wrapper that automatically includes auth headers
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const authHeaders = getAuthHeaders();

  // Merge auth headers with any existing headers
  const headers = new Headers(init?.headers);
  Object.entries(authHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return fetch(input, {
    ...init,
    headers
  });
}

/**
 * Create WebSocket URL with session token if available
 */
export function getAuthenticatedWebSocketUrl(baseUrl: string): string {
  const sessionToken = AuthStorage.getSessionToken();

  if (sessionToken) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}session_token=${encodeURIComponent(sessionToken)}`;
  }

  return baseUrl;
}
