import { describe, it, expect } from 'vitest';
import { loadConfigFromEnv } from './config';

describe('loadConfigFromEnv', () => {
  it('applies defaults for an empty environment', () => {
    const config = loadConfigFromEnv({});
    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(3002);
    expect(config.authRequired).toBe(false);
    expect(config.defaultProjects).toEqual([]);
    expect(config.sessionIdleTimeoutMs).toBe(24 * 60 * 60 * 1000);
  });

  it('prefers VIBETREE_USERNAME over USERNAME', () => {
    // Windows sets USERNAME for every process; it must never silently
    // become a credential when the VIBETREE_ variant is present
    const config = loadConfigFromEnv({
      USERNAME: 'windows-user',
      VIBETREE_USERNAME: 'real-user',
      PASSWORD: 'old',
      VIBETREE_PASSWORD: 'new'
    });
    expect(config.username).toBe('real-user');
    expect(config.password).toBe('new');
  });

  it('falls back to legacy USERNAME/PASSWORD names', () => {
    const config = loadConfigFromEnv({ USERNAME: 'legacy', PASSWORD: 'pw' });
    expect(config.username).toBe('legacy');
    expect(config.password).toBe('pw');
  });

  it('parses DEFAULT_PROJECTS as a trimmed comma list', () => {
    const config = loadConfigFromEnv({ DEFAULT_PROJECTS: ' /a , /b ,, ' });
    expect(config.defaultProjects).toEqual(['/a', '/b']);
  });

  it('parses auth and numeric settings', () => {
    const config = loadConfigFromEnv({
      AUTH_REQUIRED: 'true',
      PORT: '4000',
      SESSION_IDLE_TIMEOUT_MS: '60000'
    });
    expect(config.authRequired).toBe(true);
    expect(config.port).toBe(4000);
    expect(config.sessionIdleTimeoutMs).toBe(60000);
  });

  it('recognizes all insecure-LAN dev flags', () => {
    expect(loadConfigFromEnv({ ALLOW_INSECURE_LAN: '1' }).allowInsecureLan).toBe(true);
    expect(loadConfigFromEnv({ ALLOW_INSECURE_NETWORK: '1' }).allowInsecureLan).toBe(true);
    expect(loadConfigFromEnv({ ALLOW_NETWORK_DEV: '1' }).allowInsecureLan).toBe(true);
    expect(loadConfigFromEnv({}).allowInsecureLan).toBe(false);
  });
});
