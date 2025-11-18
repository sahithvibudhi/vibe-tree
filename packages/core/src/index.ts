// Export all types
export * from './types';

// Export adapter interfaces
export { CommunicationAdapter, BaseAdapter } from './adapters/CommunicationAdapter';

// Export services
export { ShellSessionManager } from './services/ShellSessionManager';
export { TerminalForkManager } from './services/TerminalForkManager';

// Export utilities
export * from './utils/git-parser';
export * from './utils/shell';
export * from './utils/git';
export * from './utils/network';
export * from './utils/shell-escape';
export * from './utils/system-diagnostics';

// Version info
export const VERSION = '0.0.1';