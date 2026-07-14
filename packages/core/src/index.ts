// Export all types
export * from './types';

// Export adapter interfaces
export { CommunicationAdapter, BaseAdapter } from './adapters/CommunicationAdapter';
export { WebSocketAdapter } from './adapters/WebSocketAdapter';

// Export services
export { ShellSessionManager } from './services/ShellSessionManager';
export type { ManagedShellSession } from './services/ShellSessionManager';
export { OutputBuffer } from './services/OutputBuffer';

// Export utilities
export * from './utils/git-parser';
export * from './utils/shell';
export * from './utils/git';
export * from './utils/network';
export * from './utils/shell-escape';
export * from './utils/system-diagnostics';
export * from './utils/process';
export * from './utils/worktree-hooks';
export * from './utils/agent-activity';

// Version info
export const VERSION = '0.0.1';
