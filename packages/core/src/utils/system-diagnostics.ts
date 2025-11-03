import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

export interface SystemDiagnostics {
  // File descriptor information
  fileDescriptorLimit: {
    soft: number | null;
    hard: number | null;
  };
  openFileDescriptors: number | null;

  // Process information
  processLimit: number | null;
  currentProcessCount: number | null;

  // System information
  platform: string;
  totalMemory: number;
  freeMemory: number;

  // Error context
  warnings: string[];
}

/**
 * Get file descriptor limits using ulimit
 */
async function getFileDescriptorLimits(): Promise<{ soft: number | null; hard: number | null }> {
  try {
    // Get soft limit
    const softResult = await execAsync('ulimit -n');
    const soft = parseInt(softResult.stdout.trim(), 10);

    // Get hard limit
    const hardResult = await execAsync('ulimit -Hn');
    const hard = parseInt(hardResult.stdout.trim(), 10);

    return {
      soft: isNaN(soft) ? null : soft,
      hard: isNaN(hard) ? null : hard
    };
  } catch (error) {
    return { soft: null, hard: null };
  }
}

/**
 * Get current number of open file descriptors for the current process
 */
async function getOpenFileDescriptors(): Promise<number | null> {
  try {
    const pid = process.pid;

    if (process.platform === 'darwin' || process.platform === 'linux') {
      // On Unix-like systems, count files in /proc/[pid]/fd or use lsof
      if (process.platform === 'linux') {
        const { stdout } = await execAsync(`ls -1 /proc/${pid}/fd | wc -l`);
        return parseInt(stdout.trim(), 10);
      } else if (process.platform === 'darwin') {
        // macOS: use lsof
        const { stdout } = await execAsync(`lsof -p ${pid} | wc -l`);
        // lsof includes header line, so subtract 1
        return Math.max(0, parseInt(stdout.trim(), 10) - 1);
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Get process limit using ulimit
 */
async function getProcessLimit(): Promise<number | null> {
  try {
    const { stdout } = await execAsync('ulimit -u');
    const limit = parseInt(stdout.trim(), 10);
    return isNaN(limit) ? null : limit;
  } catch (error) {
    return null;
  }
}

/**
 * Get current process count for the current user
 */
async function getCurrentProcessCount(): Promise<number | null> {
  try {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      const { stdout } = await execAsync(`ps -u ${process.env.USER || process.env.USERNAME} | wc -l`);
      // ps includes header line, so subtract 1
      return Math.max(0, parseInt(stdout.trim(), 10) - 1);
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Generate warnings based on system diagnostics
 */
function generateWarnings(diagnostics: SystemDiagnostics): string[] {
  const warnings: string[] = [];

  // Check file descriptor usage
  if (diagnostics.openFileDescriptors !== null && diagnostics.fileDescriptorLimit.soft !== null) {
    const usage = diagnostics.openFileDescriptors / diagnostics.fileDescriptorLimit.soft;
    if (usage > 0.9) {
      warnings.push(`File descriptor usage is at ${(usage * 100).toFixed(0)}% (${diagnostics.openFileDescriptors}/${diagnostics.fileDescriptorLimit.soft})`);
    } else if (usage > 0.75) {
      warnings.push(`File descriptor usage is high: ${(usage * 100).toFixed(0)}% (${diagnostics.openFileDescriptors}/${diagnostics.fileDescriptorLimit.soft})`);
    }
  }

  // Check if limit is too low
  if (diagnostics.fileDescriptorLimit.soft !== null && diagnostics.fileDescriptorLimit.soft < 256) {
    warnings.push(`File descriptor soft limit is very low (${diagnostics.fileDescriptorLimit.soft}). Consider increasing with 'ulimit -n 1024'`);
  }

  // Check process usage
  if (diagnostics.currentProcessCount !== null && diagnostics.processLimit !== null) {
    const usage = diagnostics.currentProcessCount / diagnostics.processLimit;
    if (usage > 0.9) {
      warnings.push(`Process count is at ${(usage * 100).toFixed(0)}% (${diagnostics.currentProcessCount}/${diagnostics.processLimit})`);
    }
  }

  // Check memory
  const memoryUsagePercent = (1 - diagnostics.freeMemory / diagnostics.totalMemory) * 100;
  if (memoryUsagePercent > 95) {
    warnings.push(`System memory is critically low: ${memoryUsagePercent.toFixed(1)}% used`);
  }

  return warnings;
}

/**
 * Collect comprehensive system diagnostics
 */
export async function getSystemDiagnostics(): Promise<SystemDiagnostics> {
  const [fdLimits, openFds, processLimit, processCount] = await Promise.all([
    getFileDescriptorLimits(),
    getOpenFileDescriptors(),
    getProcessLimit(),
    getCurrentProcessCount()
  ]);

  const diagnostics: SystemDiagnostics = {
    fileDescriptorLimit: fdLimits,
    openFileDescriptors: openFds,
    processLimit,
    currentProcessCount: processCount,
    platform: process.platform,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    warnings: []
  };

  // Generate warnings based on collected data
  diagnostics.warnings = generateWarnings(diagnostics);

  return diagnostics;
}

/**
 * Format diagnostics for display
 */
export function formatDiagnostics(diagnostics: SystemDiagnostics): string {
  const lines: string[] = [];

  lines.push('=== System Diagnostics ===');
  lines.push(`Platform: ${diagnostics.platform}`);
  lines.push('');

  lines.push('File Descriptors:');
  if (diagnostics.fileDescriptorLimit.soft !== null) {
    lines.push(`  Soft Limit: ${diagnostics.fileDescriptorLimit.soft}`);
  }
  if (diagnostics.fileDescriptorLimit.hard !== null) {
    lines.push(`  Hard Limit: ${diagnostics.fileDescriptorLimit.hard}`);
  }
  if (diagnostics.openFileDescriptors !== null) {
    lines.push(`  Currently Open: ${diagnostics.openFileDescriptors}`);
    if (diagnostics.fileDescriptorLimit.soft !== null) {
      const usage = (diagnostics.openFileDescriptors / diagnostics.fileDescriptorLimit.soft * 100).toFixed(1);
      lines.push(`  Usage: ${usage}%`);
    }
  }
  lines.push('');

  lines.push('Processes:');
  if (diagnostics.processLimit !== null) {
    lines.push(`  Limit: ${diagnostics.processLimit}`);
  }
  if (diagnostics.currentProcessCount !== null) {
    lines.push(`  Current Count: ${diagnostics.currentProcessCount}`);
  }
  lines.push('');

  lines.push('Memory:');
  const totalGB = (diagnostics.totalMemory / (1024 ** 3)).toFixed(2);
  const freeGB = (diagnostics.freeMemory / (1024 ** 3)).toFixed(2);
  const usedPercent = ((1 - diagnostics.freeMemory / diagnostics.totalMemory) * 100).toFixed(1);
  lines.push(`  Total: ${totalGB} GB`);
  lines.push(`  Free: ${freeGB} GB`);
  lines.push(`  Used: ${usedPercent}%`);

  if (diagnostics.warnings.length > 0) {
    lines.push('');
    lines.push('⚠️  WARNINGS:');
    diagnostics.warnings.forEach(warning => {
      lines.push(`  - ${warning}`);
    });
  }

  return lines.join('\n');
}
