export interface ServerConfig {
  host: string;
  port: number;
  authRequired: boolean;
  username?: string;
  password?: string;
  jwtSecret: string;
  projectPath: string;
  defaultProjects: string[];
  /**
   * Roots scanned by repo discovery and used as the browse starting point.
   */
  projectsRoots: string[];
  sessionIdleTimeoutMs: number;
  allowInsecureLan: boolean;
  nodeEnv: string;
  /**
   * Pre-shared connection token for embedded mode (desktop). Connections
   * presenting this token are trusted without further authentication.
   */
  staticToken?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    host: env.HOST || '0.0.0.0',
    port: env.PORT ? parseInt(env.PORT, 10) : 3002,
    authRequired: env.AUTH_REQUIRED === 'true',
    // VIBETREE_-prefixed names take priority: plain USERNAME is set by the OS
    // on Windows and would silently become a valid credential
    username: env.VIBETREE_USERNAME || env.USERNAME,
    password: env.VIBETREE_PASSWORD || env.PASSWORD,
    jwtSecret: env.JWT_SECRET || 'vibetree-dev-secret-change-in-production',
    projectPath: env.PROJECT_PATH || process.cwd(),
    defaultProjects: (env.DEFAULT_PROJECTS || '')
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0),
    projectsRoots: (env.VIBETREE_PROJECTS_ROOT || '')
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0),
    sessionIdleTimeoutMs: env.SESSION_IDLE_TIMEOUT_MS
      ? parseInt(env.SESSION_IDLE_TIMEOUT_MS, 10)
      : DAY_MS,
    allowInsecureLan:
      env.ALLOW_INSECURE_NETWORK === '1' ||
      env.ALLOW_INSECURE_LAN === '1' ||
      env.ALLOW_NETWORK_DEV === '1',
    nodeEnv: env.NODE_ENV || 'development'
  };
}
