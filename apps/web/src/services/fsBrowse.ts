import { getServerHttpUrl } from './portDiscovery';
import { authenticatedFetch } from './authService';

export interface DirectoryEntry {
  name: string;
  path: string;
  isGitRepo: boolean;
}

export interface DirectoryListing {
  path: string;
  parent: string | null;
  isGitRepo: boolean;
  entries: DirectoryEntry[];
  truncated: boolean;
}

export interface DiscoveredRepo {
  name: string;
  path: string;
}

export async function listServerDirectory(dirPath?: string): Promise<DirectoryListing> {
  const httpUrl = await getServerHttpUrl();
  const query = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
  const response = await authenticatedFetch(`${httpUrl}/api/fs/list${query}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function discoverServerRepos(): Promise<DiscoveredRepo[]> {
  const httpUrl = await getServerHttpUrl();
  const response = await authenticatedFetch(`${httpUrl}/api/projects/discover`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const body = await response.json();
  return body.repos ?? [];
}
