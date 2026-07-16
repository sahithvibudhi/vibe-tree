import { getServerHttpUrl } from './portDiscovery';
import { authenticatedFetch } from './authService';

export interface ProjectConfig {
  agentCommand?: string;
}

export async function getProjectConfig(projectPath: string): Promise<ProjectConfig> {
  const httpUrl = await getServerHttpUrl();
  const response = await authenticatedFetch(
    `${httpUrl}/api/projects/config?path=${encodeURIComponent(projectPath)}`
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function updateProjectConfig(
  projectPath: string,
  config: ProjectConfig
): Promise<ProjectConfig> {
  const httpUrl = await getServerHttpUrl();
  const response = await authenticatedFetch(`${httpUrl}/api/projects/config`, {
    method: 'PUT',
    body: JSON.stringify({ path: projectPath, ...config })
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
