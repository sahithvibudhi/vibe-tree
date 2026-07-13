import type { AuthConfig, LoginCredentials, LoginResponse } from '../types';

const STORAGE_KEYS = {
  SESSION_TOKEN: 'vibetree_session_token',
  IS_AUTHENTICATED: 'vibetree_is_authenticated'
} as const;

export class AuthAPI {
  private baseUrl: string;

  constructor(serverUrl?: string) {
    // Default to common development URLs, fallback to current origin
    this.baseUrl = serverUrl || this.detectServerUrl();
  }

  private detectServerUrl(): string {
    // Try common development server ports
    const commonPorts = ['3002', '3001', '8080'];
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;

    // If we're on localhost, try development server ports
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // Default to port 3002 (server default)
      return `${protocol}//${hostname}:3002`;
    }

    // For production or other environments, use current origin
    return window.location.origin;
  }

  async checkAuthConfig(): Promise<AuthConfig> {
    const response = await fetch(`${this.baseUrl}/api/auth/config`);
    if (!response.ok) {
      throw new AuthError('Failed to check authentication configuration');
    }
    return response.json();
  }

  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(credentials)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Login failed' }));
      throw new AuthError(error.error || 'Login failed');
    }

    return response.json();
  }

  async logout(sessionToken: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`
      }
    });

    if (!response.ok) {
      // Don't throw on logout failure - just log it
      console.warn('Logout request failed, but continuing with local cleanup');
    }
  }

  getWebSocketUrl(sessionToken: string): string {
    const wsProtocol = this.baseUrl.startsWith('https') ? 'wss' : 'ws';
    const baseWsUrl = this.baseUrl.replace(/^https?/, wsProtocol);
    return `${baseWsUrl}?session_token=${encodeURIComponent(sessionToken)}`;
  }

  getAuthHeaders(sessionToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${sessionToken}`
    };
  }
}

export class AuthStorage {
  static getSessionToken(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEYS.SESSION_TOKEN);
    } catch {
      return null;
    }
  }

  static setSessionToken(token: string): void {
    try {
      localStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, token);
      localStorage.setItem(STORAGE_KEYS.IS_AUTHENTICATED, 'true');
    } catch (error) {
      console.warn('Failed to save session token to localStorage:', error);
    }
  }

  static removeSessionToken(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.IS_AUTHENTICATED);
    } catch (error) {
      console.warn('Failed to remove session token from localStorage:', error);
    }
  }

  static isAuthenticated(): boolean {
    try {
      return (
        localStorage.getItem(STORAGE_KEYS.IS_AUTHENTICATED) === 'true' &&
        !!localStorage.getItem(STORAGE_KEYS.SESSION_TOKEN)
      );
    } catch {
      return false;
    }
  }
}

export class AuthError extends Error {
  public code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

export function createAuthenticatedFetch(baseUrl: string, getSessionToken: () => string | null) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const sessionToken = getSessionToken();

    const headers = new Headers(init?.headers);
    if (sessionToken) {
      headers.set('Authorization', `Bearer ${sessionToken}`);
    }

    return fetch(input, {
      ...init,
      headers
    });
  };
}
