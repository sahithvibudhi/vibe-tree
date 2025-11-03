import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

export interface ChildProcessInfo {
  pid: number;
  ppid: number;
  state: string;
  stateDescription: string;
  command: string;
  startTime: string;
  cpuTime: string;
  children: ChildProcessInfo[];
  level: number;
}

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

  // Child processes
  childProcesses: ChildProcessInfo[];
  zombieProcessCount: number;

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
 * Get state description from ps state code
 */
function getStateDescription(state: string): string {
  const stateMap: Record<string, string> = {
    'R': 'Running',
    'S': 'Sleeping',
    'I': 'Idle',
    'T': 'Stopped',
    'Z': 'Zombie',
    'D': 'Uninterruptible',
    'U': 'Uninterruptible'
  };

  // Handle composite states like 'R+', 'S+', etc.
  const baseState = state.charAt(0);
  const description = stateMap[baseState] || 'Unknown';

  // Add additional indicators
  if (state.includes('+')) {
    return `${description} (foreground)`;
  } else if (state.includes('<')) {
    return `${description} (high priority)`;
  } else if (state.includes('N')) {
    return `${description} (low priority)`;
  }

  return description;
}

/**
 * Get all child processes of the current process (recursive) as a tree
 */
async function getChildProcesses(): Promise<ChildProcessInfo[]> {
  try {
    const currentPid = process.pid;

    if (process.platform === 'darwin' || process.platform === 'linux') {
      // Get all processes with their parent PIDs
      // Format: PID PPID STATE STARTED TIME COMMAND
      const { stdout } = await execAsync(`ps -A -o pid,ppid,state,lstart,time,command | grep -v 'PID' || true`);

      if (!stdout.trim()) {
        return [];
      }

      const lines = stdout.trim().split('\n');
      const allProcesses = new Map<number, ChildProcessInfo>();

      // Parse all processes
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Parse the line - format is complex due to LSTART
        const match = trimmed.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\w+\s+\w+\s+\d+\s+\d+:\d+:\d+\s+\d+)\s+(\S+)\s+(.+)$/);
        if (!match) continue;

        const [, pidStr, ppidStr, state, startTime, cpuTime, command] = match;
        const pid = parseInt(pidStr, 10);
        const ppid = parseInt(ppidStr, 10);

        allProcesses.set(pid, {
          pid,
          ppid,
          state,
          stateDescription: getStateDescription(state),
          command: command.trim(),
          startTime,
          cpuTime,
          children: [],
          level: 0
        });
      }

      // Build tree structure
      function buildTree(parentPid: number, level: number): ChildProcessInfo[] {
        const children: ChildProcessInfo[] = [];

        for (const [pid, proc] of allProcesses) {
          if (proc.ppid === parentPid) {
            proc.level = level;
            proc.children = buildTree(pid, level + 1);
            children.push(proc);
          }
        }

        return children;
      }

      return buildTree(currentPid, 0);
    }

    return [];
  } catch (error) {
    console.error('Error getting child processes:', error);
    return [];
  }
}

/**
 * Count total processes in tree (including nested children)
 */
function countProcessesInTree(processes: ChildProcessInfo[]): number {
  let count = processes.length;
  for (const proc of processes) {
    count += countProcessesInTree(proc.children);
  }
  return count;
}

/**
 * Count zombie processes in tree
 */
function countZombiesInTree(processes: ChildProcessInfo[]): number {
  let count = 0;
  for (const proc of processes) {
    if (proc.state.startsWith('Z')) {
      count++;
    }
    count += countZombiesInTree(proc.children);
  }
  return count;
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

  // Check for zombie processes
  if (diagnostics.zombieProcessCount > 0) {
    warnings.push(`Found ${diagnostics.zombieProcessCount} zombie process${diagnostics.zombieProcessCount > 1 ? 'es' : ''} - these may hold file descriptors`);
  }

  // Check for high child process count
  const totalChildren = countProcessesInTree(diagnostics.childProcesses);
  if (totalChildren > 50) {
    warnings.push(`High number of child processes: ${totalChildren} - potential process leak`);
  }

  return warnings;
}

/**
 * Collect comprehensive system diagnostics
 */
export async function getSystemDiagnostics(): Promise<SystemDiagnostics> {
  const [fdLimits, openFds, processLimit, processCount, childProcesses] = await Promise.all([
    getFileDescriptorLimits(),
    getOpenFileDescriptors(),
    getProcessLimit(),
    getCurrentProcessCount(),
    getChildProcesses()
  ]);

  const zombieCount = countZombiesInTree(childProcesses);

  const diagnostics: SystemDiagnostics = {
    fileDescriptorLimit: fdLimits,
    openFileDescriptors: openFds,
    processLimit,
    currentProcessCount: processCount,
    childProcesses,
    zombieProcessCount: zombieCount,
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
