import fs from 'fs/promises';
import path from 'path';

/**
 * Per-project VibeTree configuration, stored inside the repository at
 * .vibetree/config.json next to the lifecycle hooks, so a team can commit
 * shared defaults (which agent CLI this project uses).
 */
export interface ProjectConfig {
  agentCommand?: string;
}

function configPath(projectPath: string): string {
  return path.join(projectPath, '.vibetree', 'config.json');
}

export async function readProjectConfig(projectPath: string): Promise<ProjectConfig> {
  try {
    const raw = await fs.readFile(configPath(projectPath), 'utf8');
    const parsed = JSON.parse(raw);
    const config: ProjectConfig = {};
    if (typeof parsed.agentCommand === 'string' && parsed.agentCommand.trim().length > 0) {
      config.agentCommand = parsed.agentCommand.trim();
    }
    return config;
  } catch {
    // Missing or malformed config is the common case, not an error
    return {};
  }
}

export async function writeProjectConfig(
  projectPath: string,
  updates: ProjectConfig
): Promise<ProjectConfig> {
  const current = await readProjectConfig(projectPath);
  const next: ProjectConfig = { ...current, ...updates };
  if (!next.agentCommand?.trim()) {
    delete next.agentCommand;
  }
  await fs.mkdir(path.dirname(configPath(projectPath)), { recursive: true });
  await fs.writeFile(configPath(projectPath), JSON.stringify(next, null, 2) + '\n');
  return next;
}
