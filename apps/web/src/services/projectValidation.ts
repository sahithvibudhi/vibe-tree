import { getServerHttpUrl } from './portDiscovery';
import { authenticatedFetch } from './authService';

interface ProjectValidationResult {
  path: string;
  name?: string;
  valid: boolean;
  error?: string;
}

interface AutoLoadResponse {
  projectPaths: string[];
  validationResults: ProjectValidationResult[];
  defaultProjectPath: string | null;
}

/**
 * Validate multiple project paths using the server API
 * @param projectPaths - Array of project paths to validate
 * @returns Promise with validation results
 */
export async function validateProjectPaths(
  projectPaths: string[]
): Promise<ProjectValidationResult[]> {
  if (projectPaths.length === 0) {
    return [];
  }

  try {
    const httpUrl = await getServerHttpUrl();

    const response = await authenticatedFetch(`${httpUrl}/api/projects/validate`, {
      method: 'POST',
      body: JSON.stringify({ projectPaths })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to validate projects:', error);
    // Return error results for all paths
    return projectPaths.map((path) => ({
      path,
      valid: false,
      error: `Validation failed: ${(error as Error).message}`
    }));
  }
}

/**
 * Auto-load projects from backend environment configuration
 * @returns Promise with auto-load response containing projects and default
 */
export async function autoLoadProjects(): Promise<AutoLoadResponse> {
  try {
    const httpUrl = await getServerHttpUrl();

    const response = await authenticatedFetch(`${httpUrl}/api/projects/auto-load`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to auto-load projects:', error);
    // Return empty response on error
    return {
      projectPaths: [],
      validationResults: [],
      defaultProjectPath: null
    };
  }
}
