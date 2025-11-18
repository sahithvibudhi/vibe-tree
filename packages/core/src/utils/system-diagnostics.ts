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
  memoryRSS: number; // Resident Set Size in KB
  memoryVSZ: number; // Virtual Size in KB
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

  // Memory information for process tree
  processTreeMemory: {
    currentProcessRSS: number; // Current process RSS in KB
    currentProcessVSZ: number; // Current process VSZ in KB
    totalTreeRSS: number; // Total RSS of current process + all children in KB
    totalTreeVSZ: number; // Total VSZ of current process + all children in KB
  };

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
      // Get all processes with their parent PIDs and memory info
      // Format: PID PPID RSS VSZ STATE STARTED TIME COMMAND
      // RSS and VSZ are in KB
      const { stdout } = await execAsync(`ps -A -o pid,ppid,rss,vsz,state,lstart,time,command | grep -v 'PID' || true`);

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
        // PID PPID RSS VSZ STATE LSTART(5 fields) TIME COMMAND
        const match = trimmed.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\w+\s+\w+\s+\d+\s+\d+:\d+:\d+\s+\d+)\s+(\S+)\s+(.+)$/);
        if (!match) continue;

        const [, pidStr, ppidStr, rssStr, vszStr, state, startTime, cpuTime, command] = match;
        const pid = parseInt(pidStr, 10);
        const ppid = parseInt(ppidStr, 10);
        const rss = parseInt(rssStr, 10);
        const vsz = parseInt(vszStr, 10);

        allProcesses.set(pid, {
          pid,
          ppid,
          state,
          stateDescription: getStateDescription(state),
          command: command.trim(),
          startTime,
          cpuTime,
          memoryRSS: rss,
          memoryVSZ: vsz,
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
 * Get memory info for current process
 */
async function getCurrentProcessMemory(): Promise<{ rss: number; vsz: number } | null> {
  try {
    const currentPid = process.pid;

    if (process.platform === 'darwin' || process.platform === 'linux') {
      const { stdout } = await execAsync(`ps -p ${currentPid} -o rss,vsz | tail -1`);
      const parts = stdout.trim().split(/\s+/);
      if (parts.length >= 2) {
        return {
          rss: parseInt(parts[0], 10),
          vsz: parseInt(parts[1], 10)
        };
      }
    }
    return null;
  } catch (error) {
    return null;
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
 * Calculate total memory (RSS and VSZ) for process tree
 */
function calculateTreeMemory(processes: ChildProcessInfo[]): { rss: number; vsz: number } {
  let totalRSS = 0;
  let totalVSZ = 0;

  for (const proc of processes) {
    totalRSS += proc.memoryRSS;
    totalVSZ += proc.memoryVSZ;

    if (proc.children.length > 0) {
      const childMemory = calculateTreeMemory(proc.children);
      totalRSS += childMemory.rss;
      totalVSZ += childMemory.vsz;
    }
  }

  return { rss: totalRSS, vsz: totalVSZ };
}

/**
 * Format memory size in KB to human-readable format
 */
export function formatMemorySize(kb: number): string {
  if (kb < 1024) {
    return `${kb.toFixed(0)} KB`;
  } else if (kb < 1024 * 1024) {
    return `${(kb / 1024).toFixed(1)} MB`;
  } else {
    return `${(kb / (1024 * 1024)).toFixed(2)} GB`;
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
  const [fdLimits, openFds, processLimit, processCount, childProcesses, currentProcessMemory] = await Promise.all([
    getFileDescriptorLimits(),
    getOpenFileDescriptors(),
    getProcessLimit(),
    getCurrentProcessCount(),
    getChildProcesses(),
    getCurrentProcessMemory()
  ]);

  const zombieCount = countZombiesInTree(childProcesses);
  const childrenMemory = calculateTreeMemory(childProcesses);

  // Calculate total tree memory (current process + all children)
  const currentRSS = currentProcessMemory?.rss || 0;
  const currentVSZ = currentProcessMemory?.vsz || 0;
  const totalTreeRSS = currentRSS + childrenMemory.rss;
  const totalTreeVSZ = currentVSZ + childrenMemory.vsz;

  const diagnostics: SystemDiagnostics = {
    fileDescriptorLimit: fdLimits,
    openFileDescriptors: openFds,
    processLimit,
    currentProcessCount: processCount,
    childProcesses,
    zombieProcessCount: zombieCount,
    processTreeMemory: {
      currentProcessRSS: currentRSS,
      currentProcessVSZ: currentVSZ,
      totalTreeRSS: totalTreeRSS,
      totalTreeVSZ: totalTreeVSZ
    },
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

/**
 * Extended diagnostics for posix_spawn failure investigation
 */
export interface ExtendedDiagnostics extends SystemDiagnostics {
  // PTY-specific information
  ptyProcesses: {
    count: number;
    pids: number[];
    details: Array<{
      pid: number;
      command: string;
      state: string;
      memoryRSS: number;
      cpuTime: string;
      startTime: string;
    }>;
  };

  // App-specific PTY tracking
  appPtyInfo: {
    totalPtyInstancesCreated: number; // Total PTY instances created by our app during lifetime
    currentActiveSessions: number; // Currently active PTY sessions
    ptyChildProcesses: number; // PTY processes that are direct children of our app process
    ptyMasterFds: number | null; // Number of /dev/ptmx (PTY master) file descriptors held by the app
    ptySlaveFds: number | null; // Number of PTY slave (ttys/ttyp) file descriptors held by the app
    totalPtyFds: number | null; // Total PTY-related file descriptors held by the app
  };

  // File descriptor details
  fileDescriptorDetails: {
    byType?: Record<string, number>; // e.g., { REG: 10, CHR: 5, PIPE: 3 }
    topConsumers?: Array<{
      type: string;
      name: string;
      count: number;
    }>;
  } | null;

  // Thread information
  threadInfo: {
    threadCount: number | null;
    threadLimit: number | null;
  };

  // System load
  systemLoad: {
    load1: number;
    load5: number;
    load15: number;
  };

  // Kernel limits (macOS specific)
  kernelLimits: {
    maxFiles: number | null;
    maxFilesPerProcess: number | null;
    maxProcesses: number | null;
    ptyDeviceLimit: number | null; // System-wide PTY device limit (kern.tty.ptmx_max)
  };

  // System-wide file descriptor usage (macOS/Linux specific)
  systemFileDescriptors: {
    current: number | null; // Current FDs open across entire system
    limit: number | null; // System-wide FD limit (kern.maxfiles)
  };

  // PTY device information (macOS/BSD specific)
  ptyDeviceInfo: {
    currentCount: number | null; // Current number of PTY devices in use
    systemLimit: number | null; // System-wide PTY device limit
  };

  // Environment variables that might affect spawning
  environmentVariables: {
    shell: string | undefined;
    path: string | undefined;
    home: string | undefined;
    user: string | undefined;
  };

  // Node.js process information
  nodeProcess: {
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    resourceUsage?: NodeJS.ResourceUsage;
  };

  // Timestamp of diagnostic collection
  timestamp: string;
}

/**
 * Get detailed file descriptor information using lsof
 */
async function getFileDescriptorDetails(): Promise<ExtendedDiagnostics['fileDescriptorDetails']> {
  try {
    const pid = process.pid;

    if (process.platform === 'darwin') {
      // Get detailed lsof output
      const { stdout } = await execAsync(`lsof -p ${pid} -F t n 2>/dev/null || true`);

      if (!stdout) return null;

      const lines = stdout.split('\n');
      const byType: Record<string, number> = {};
      const fileNames: Record<string, Set<string>> = {};

      let currentType: string | null = null;

      for (const line of lines) {
        if (line.startsWith('t')) {
          // Type line
          currentType = line.substring(1);
          if (!byType[currentType]) {
            byType[currentType] = 0;
            fileNames[currentType] = new Set();
          }
        } else if (line.startsWith('n') && currentType) {
          // Name line
          const name = line.substring(1);
          byType[currentType]++;
          fileNames[currentType].add(name);
        }
      }

      // Find top consumers
      const topConsumers = Object.entries(byType)
        .map(([type, count]) => ({
          type,
          name: Array.from(fileNames[type]).slice(0, 3).join(', '),
          count
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return { byType, topConsumers };
    }

    return null;
  } catch (error) {
    console.error('Error getting FD details:', error);
    return null;
  }
}

/**
 * Get thread count for current process
 */
async function getThreadInfo(): Promise<ExtendedDiagnostics['threadInfo']> {
  try {
    const pid = process.pid;
    let threadCount: number | null = null;
    let threadLimit: number | null = null;

    if (process.platform === 'darwin') {
      // macOS: use ps to get thread count
      const { stdout } = await execAsync(`ps -M -p ${pid} | wc -l`);
      // ps includes header, so subtract 1
      threadCount = Math.max(0, parseInt(stdout.trim(), 10) - 1);

      // Get thread limit from sysctl
      try {
        const { stdout: limitStdout } = await execAsync('sysctl -n kern.maxprocperuid');
        threadLimit = parseInt(limitStdout.trim(), 10);
      } catch {
        threadLimit = null;
      }
    } else if (process.platform === 'linux') {
      // Linux: count threads in /proc/[pid]/task
      const { stdout } = await execAsync(`ls /proc/${pid}/task | wc -l`);
      threadCount = parseInt(stdout.trim(), 10);

      // Get thread limit
      try {
        const { stdout: limitStdout } = await execAsync('ulimit -u');
        threadLimit = parseInt(limitStdout.trim(), 10);
      } catch {
        threadLimit = null;
      }
    }

    return { threadCount, threadLimit };
  } catch (error) {
    return { threadCount: null, threadLimit: null };
  }
}

/**
 * Get PTY-related processes
 */
async function getPtyProcesses(): Promise<ExtendedDiagnostics['ptyProcesses']> {
  try {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      // Look for processes with PTY (tty/pts) or node-pty in command
      const { stdout } = await execAsync(
        `ps -A -o pid,tty,state,rss,time,lstart,command | grep -E 'pts/|ttys|node-pty' | grep -v grep || true`
      );

      if (!stdout.trim()) {
        return { count: 0, pids: [], details: [] };
      }

      const lines = stdout.trim().split('\n');
      const details: ExtendedDiagnostics['ptyProcesses']['details'] = [];
      const pids: number[] = [];

      for (const line of lines) {
        const match = line.trim().match(/^\s*(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\S+)\s+(\w+\s+\w+\s+\d+\s+\d+:\d+:\d+\s+\d+)\s+(.+)$/);
        if (match) {
          const [, pidStr, , state, rssStr, cpuTime, startTime, command] = match;
          const pid = parseInt(pidStr, 10);
          const rss = parseInt(rssStr, 10);

          pids.push(pid);
          details.push({
            pid,
            command: command.trim(),
            state,
            memoryRSS: rss,
            cpuTime,
            startTime
          });
        }
      }

      return { count: details.length, pids, details };
    }

    return { count: 0, pids: [], details: [] };
  } catch (error) {
    console.error('Error getting PTY processes:', error);
    return { count: 0, pids: [], details: [] };
  }
}

/**
 * Count PTY child processes of our app (direct children only)
 * This helps identify if we have PTY processes that are still running as children
 */
async function countAppPtyChildProcesses(allChildProcesses: ChildProcessInfo[]): Promise<number> {
  try {
    // Count how many of our direct child processes have a PTY/TTY
    // Look for processes with pts/ or ttys in their command or that are shell processes
    let count = 0;

    for (const child of allChildProcesses) {
      // Check if this is a PTY-related process
      // Common indicators: bash, zsh, sh processes with TTY, or processes with pts/ttys in command
      const command = child.command.toLowerCase();
      const isPtyShell = (command.includes('bash') || command.includes('zsh') || command.includes('sh'))
                         && !command.includes('ssh');
      const hasPtyInCommand = command.includes('pts/') || command.includes('ttys');

      if (isPtyShell || hasPtyInCommand) {
        count++;
      }

      // Recursively count in nested children
      if (child.children && child.children.length > 0) {
        count += await countAppPtyChildProcesses(child.children);
      }
    }

    return count;
  } catch (error) {
    console.error('Error counting app PTY child processes:', error);
    return 0;
  }
}

/**
 * Get kernel limits (macOS specific)
 */
async function getKernelLimits(): Promise<ExtendedDiagnostics['kernelLimits']> {
  const limits: ExtendedDiagnostics['kernelLimits'] = {
    maxFiles: null,
    maxFilesPerProcess: null,
    maxProcesses: null,
    ptyDeviceLimit: null
  };

  if (process.platform === 'darwin') {
    try {
      // Get system-wide file limit
      const { stdout: maxFiles } = await execAsync('sysctl -n kern.maxfiles');
      limits.maxFiles = parseInt(maxFiles.trim(), 10);
    } catch {}

    try {
      // Get per-process file limit
      const { stdout: maxFilesPerProc } = await execAsync('sysctl -n kern.maxfilesperproc');
      limits.maxFilesPerProcess = parseInt(maxFilesPerProc.trim(), 10);
    } catch {}

    try {
      // Get max processes
      const { stdout: maxProc } = await execAsync('sysctl -n kern.maxproc');
      limits.maxProcesses = parseInt(maxProc.trim(), 10);
    } catch {}

    try {
      // Get PTY device limit
      const { stdout: ptyMax } = await execAsync('sysctl -n kern.tty.ptmx_max');
      limits.ptyDeviceLimit = parseInt(ptyMax.trim(), 10);
    } catch {}
  }

  return limits;
}

/**
 * Get system-wide file descriptor usage (macOS/Linux specific)
 */
async function getSystemFileDescriptors(): Promise<ExtendedDiagnostics['systemFileDescriptors']> {
  const result: ExtendedDiagnostics['systemFileDescriptors'] = {
    current: null,
    limit: null
  };

  if (process.platform === 'darwin') {
    try {
      // Get system-wide limit
      const { stdout: limitStdout } = await execAsync('sysctl -n kern.maxfiles');
      const limit = parseInt(limitStdout.trim(), 10);
      if (!isNaN(limit)) {
        result.limit = limit;
      }
    } catch (error) {
      console.error('Error getting system FD limit:', error);
    }

    try {
      // Get current system-wide usage
      // Count all open files across all processes using lsof
      const { stdout: currentStdout } = await execAsync('lsof 2>/dev/null | wc -l');
      // lsof includes header line, so subtract 1
      const current = Math.max(0, parseInt(currentStdout.trim(), 10) - 1);
      if (!isNaN(current)) {
        result.current = current;
      }
    } catch (error) {
      console.error('Error getting system FD usage:', error);
    }
  } else if (process.platform === 'linux') {
    try {
      // Get system-wide limit and current usage from /proc
      const { stdout: fileNr } = await execAsync('cat /proc/sys/fs/file-nr');
      const parts = fileNr.trim().split(/\s+/);
      if (parts.length >= 3) {
        const current = parseInt(parts[0], 10);
        const limit = parseInt(parts[2], 10);
        if (!isNaN(current)) result.current = current;
        if (!isNaN(limit)) result.limit = limit;
      }
    } catch (error) {
      console.error('Error getting system FD info:', error);
    }
  }

  return result;
}

/**
 * Get PTY device information (macOS/BSD specific)
 * Returns current number of PTY devices in use and system limit
 */
async function getPtyDeviceInfo(): Promise<ExtendedDiagnostics['ptyDeviceInfo']> {
  const info: ExtendedDiagnostics['ptyDeviceInfo'] = {
    currentCount: null,
    systemLimit: null
  };

  if (process.platform === 'darwin') {
    try {
      // Get system-wide PTY device limit using sysctl
      const { stdout: ptyMaxStdout } = await execAsync('sysctl -n kern.tty.ptmx_max');
      const limit = parseInt(ptyMaxStdout.trim(), 10);
      if (!isNaN(limit)) {
        info.systemLimit = limit;
      }
    } catch (error) {
      console.error('Error getting PTY device limit:', error);
    }

    try {
      // Count current PTY devices in /dev
      // PTY devices are named /dev/ttys* on macOS
      const { stdout: lsStdout } = await execAsync('ls -1 /dev/ttys* 2>/dev/null | wc -l');
      const count = parseInt(lsStdout.trim(), 10);
      if (!isNaN(count)) {
        info.currentCount = count;
      }
    } catch (error) {
      // If ls fails (e.g., no devices), count is 0
      info.currentCount = 0;
    }
  }

  return info;
}

/**
 * Get PTY file descriptors held by the current process
 * Returns counts for PTY master (/dev/ptmx), slave (ttys/ttyp), and total
 */
async function getAppPtyFileDescriptors(): Promise<{
  ptyMasterFds: number | null;
  ptySlaveFds: number | null;
  totalPtyFds: number | null;
}> {
  const result = {
    ptyMasterFds: null as number | null,
    ptySlaveFds: null as number | null,
    totalPtyFds: null as number | null
  };

  if (process.platform === 'darwin' || process.platform === 'linux') {
    const pid = process.pid;

    try {
      // Count PTY master devices (/dev/ptmx)
      const { stdout: masterStdout } = await execAsync(`lsof -p ${pid} 2>/dev/null | grep "/dev/ptmx" | wc -l`);
      const masterCount = parseInt(masterStdout.trim(), 10);
      if (!isNaN(masterCount)) {
        result.ptyMasterFds = masterCount;
      }
    } catch (error) {
      result.ptyMasterFds = 0;
    }

    try {
      // Count PTY slave devices (ttys/ttyp)
      const { stdout: slaveStdout } = await execAsync(`lsof -p ${pid} 2>/dev/null | grep -E "ttys|ttyp" | wc -l`);
      const slaveCount = parseInt(slaveStdout.trim(), 10);
      if (!isNaN(slaveCount)) {
        result.ptySlaveFds = slaveCount;
      }
    } catch (error) {
      result.ptySlaveFds = 0;
    }

    try {
      // Count total PTY-related file descriptors
      const { stdout: totalStdout } = await execAsync(`lsof -p ${pid} 2>/dev/null | grep -E "/dev/tty|/dev/ptmx" | wc -l`);
      const totalCount = parseInt(totalStdout.trim(), 10);
      if (!isNaN(totalCount)) {
        result.totalPtyFds = totalCount;
      }
    } catch (error) {
      result.totalPtyFds = 0;
    }
  }

  return result;
}

/**
 * Collect comprehensive diagnostics for posix_spawn failure analysis
 * This gathers extensive system state to help diagnose PTY leaks and resource exhaustion
 *
 * @param sessionManagerStats Optional stats from ShellSessionManager for app-specific PTY tracking
 */
export async function getExtendedDiagnostics(sessionManagerStats?: {
  totalPtyInstancesCreated: number;
  currentActiveSessions: number;
}): Promise<ExtendedDiagnostics> {
  // Get base diagnostics
  const baseDiagnostics = await getSystemDiagnostics();

  // Get additional diagnostic info in parallel
  const [fdDetails, threadInfo, ptyProcesses, kernelLimits, ptyDeviceInfo, appPtyFds, systemFds] = await Promise.all([
    getFileDescriptorDetails(),
    getThreadInfo(),
    getPtyProcesses(),
    getKernelLimits(),
    getPtyDeviceInfo(),
    getAppPtyFileDescriptors(),
    getSystemFileDescriptors()
  ]);

  // Count PTY child processes of our app
  const ptyChildProcesses = await countAppPtyChildProcesses(baseDiagnostics.childProcesses);

  // App-specific PTY info
  const appPtyInfo = {
    totalPtyInstancesCreated: sessionManagerStats?.totalPtyInstancesCreated || 0,
    currentActiveSessions: sessionManagerStats?.currentActiveSessions || 0,
    ptyChildProcesses,
    ptyMasterFds: appPtyFds.ptyMasterFds,
    ptySlaveFds: appPtyFds.ptySlaveFds,
    totalPtyFds: appPtyFds.totalPtyFds
  };

  // Get system load
  const loadAvg = os.loadavg();
  const systemLoad = {
    load1: loadAvg[0],
    load5: loadAvg[1],
    load15: loadAvg[2]
  };

  // Get environment variables
  const environmentVariables = {
    shell: process.env.SHELL,
    path: process.env.PATH,
    home: process.env.HOME,
    user: process.env.USER || process.env.USERNAME
  };

  // Get Node.js process info
  const nodeProcess = {
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    cpuUsage: process.cpuUsage(),
    resourceUsage: typeof process.resourceUsage === 'function' ? process.resourceUsage() : undefined
  };

  return {
    ...baseDiagnostics,
    ptyProcesses,
    appPtyInfo,
    fileDescriptorDetails: fdDetails,
    threadInfo,
    systemLoad,
    kernelLimits,
    systemFileDescriptors: systemFds,
    ptyDeviceInfo,
    environmentVariables,
    nodeProcess,
    timestamp: new Date().toISOString()
  };
}

/**
 * Format extended diagnostics for display or logging
 */
export function formatExtendedDiagnostics(diagnostics: ExtendedDiagnostics): string {
  const lines: string[] = [];

  lines.push('=== COMPREHENSIVE POSIX_SPAWN FAILURE DIAGNOSTICS ===');
  lines.push(`Timestamp: ${diagnostics.timestamp}`);
  lines.push(`Platform: ${diagnostics.platform}`);
  lines.push('');

  // System Load
  lines.push('System Load:');
  lines.push(`  1-min:  ${diagnostics.systemLoad.load1.toFixed(2)}`);
  lines.push(`  5-min:  ${diagnostics.systemLoad.load5.toFixed(2)}`);
  lines.push(`  15-min: ${diagnostics.systemLoad.load15.toFixed(2)}`);
  lines.push('');

  // File Descriptors
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

  if (diagnostics.fileDescriptorDetails) {
    lines.push('  Breakdown by Type:');
    Object.entries(diagnostics.fileDescriptorDetails.byType || {})
      .sort(([, a], [, b]) => b - a)
      .forEach(([type, count]) => {
        lines.push(`    ${type}: ${count}`);
      });

    if (diagnostics.fileDescriptorDetails.topConsumers) {
      lines.push('  Top Consumers:');
      diagnostics.fileDescriptorDetails.topConsumers.forEach(consumer => {
        lines.push(`    ${consumer.type}: ${consumer.count} (${consumer.name.substring(0, 50)}...)`);
      });
    }
  }
  lines.push('');

  // Threads
  lines.push('Threads:');
  if (diagnostics.threadInfo.threadCount !== null) {
    lines.push(`  Count: ${diagnostics.threadInfo.threadCount}`);
  }
  if (diagnostics.threadInfo.threadLimit !== null) {
    lines.push(`  Limit: ${diagnostics.threadInfo.threadLimit}`);
  }
  lines.push('');

  // Processes
  lines.push('Processes:');
  if (diagnostics.processLimit !== null) {
    lines.push(`  User Limit: ${diagnostics.processLimit}`);
  }
  if (diagnostics.currentProcessCount !== null) {
    lines.push(`  Current Count: ${diagnostics.currentProcessCount}`);
  }
  if (diagnostics.kernelLimits.maxProcesses !== null) {
    lines.push(`  System Max: ${diagnostics.kernelLimits.maxProcesses}`);
  }
  lines.push('');

  // App PTY Tracking
  lines.push('App PTY Tracking:');
  lines.push(`  Total PTY Instances Created: ${diagnostics.appPtyInfo.totalPtyInstancesCreated}`);
  lines.push(`  Current Active Sessions: ${diagnostics.appPtyInfo.currentActiveSessions}`);
  lines.push(`  PTY Child Processes: ${diagnostics.appPtyInfo.ptyChildProcesses}`);

  // App PTY File Descriptors
  const ptyMasterFds = diagnostics.appPtyInfo.ptyMasterFds !== null ? diagnostics.appPtyInfo.ptyMasterFds : 0;
  const ptySlaveFds = diagnostics.appPtyInfo.ptySlaveFds !== null ? diagnostics.appPtyInfo.ptySlaveFds : 0;
  const totalPtyFds = diagnostics.appPtyInfo.totalPtyFds !== null ? diagnostics.appPtyInfo.totalPtyFds : 0;

  lines.push(`  PTY Master FDs (/dev/ptmx): ${ptyMasterFds}`);
  lines.push(`  PTY Slave FDs (ttys/ttyp): ${ptySlaveFds}`);
  lines.push(`  Total PTY FDs: ${totalPtyFds}`);

  // Note about expected FD ratios in fork architecture
  const activeSessions = diagnostics.appPtyInfo.currentActiveSessions;
  if (ptyMasterFds > 0 && activeSessions > 0) {
    const ratio = (ptyMasterFds / activeSessions).toFixed(1);
    lines.push(`  Note: ${ratio}x master FDs per session (2x is normal in fork architecture)`);
  }

  // Calculate potential leak indicator - only warn if significantly high
  const expectedMaxFds = activeSessions * 3;
  if (ptyMasterFds > expectedMaxFds) {
    const leaked = ptyMasterFds - activeSessions;
    lines.push(`  ⚠️  Potential PTY Leak: ${leaked} excess master FDs (${ptyMasterFds} FDs - ${activeSessions} sessions)`);
  }
  lines.push('');

  // PTY Processes (system-wide)
  lines.push('PTY Processes (System-wide):');
  lines.push(`  Count: ${diagnostics.ptyProcesses.count}`);
  if (diagnostics.ptyProcesses.details.length > 0) {
    lines.push('  Details:');
    diagnostics.ptyProcesses.details.forEach(proc => {
      lines.push(`    PID ${proc.pid}: ${proc.command.substring(0, 60)} (${proc.state}, ${formatMemorySize(proc.memoryRSS)})`);
    });
  }
  lines.push('');

  // PTY Devices (macOS/BSD)
  if (process.platform === 'darwin') {
    lines.push('PTY Devices:');
    if (diagnostics.ptyDeviceInfo.currentCount !== null) {
      lines.push(`  Current Count: ${diagnostics.ptyDeviceInfo.currentCount}`);
    }
    if (diagnostics.ptyDeviceInfo.systemLimit !== null) {
      lines.push(`  System Limit: ${diagnostics.ptyDeviceInfo.systemLimit}`);
    }
    if (diagnostics.ptyDeviceInfo.currentCount !== null && diagnostics.ptyDeviceInfo.systemLimit !== null) {
      const usage = (diagnostics.ptyDeviceInfo.currentCount / diagnostics.ptyDeviceInfo.systemLimit * 100).toFixed(1);
      lines.push(`  Usage: ${usage}%`);

      // Add warning if usage is high
      if (diagnostics.ptyDeviceInfo.currentCount / diagnostics.ptyDeviceInfo.systemLimit > 0.8) {
        lines.push(`  ⚠️  WARNING: PTY device usage is high (${usage}%)`);
      }
    }
    lines.push('');
  }

  // Child Processes Summary
  const totalChildren = countProcessesInTree(diagnostics.childProcesses);
  lines.push('Child Processes:');
  lines.push(`  Total: ${totalChildren}`);
  lines.push(`  Zombies: ${diagnostics.zombieProcessCount}`);
  lines.push('');

  // Memory
  lines.push('Memory:');
  const totalGB = (diagnostics.totalMemory / (1024 ** 3)).toFixed(2);
  const freeGB = (diagnostics.freeMemory / (1024 ** 3)).toFixed(2);
  const usedPercent = ((1 - diagnostics.freeMemory / diagnostics.totalMemory) * 100).toFixed(1);
  lines.push(`  System Total: ${totalGB} GB`);
  lines.push(`  System Free: ${freeGB} GB`);
  lines.push(`  System Used: ${usedPercent}%`);
  lines.push(`  Process RSS: ${formatMemorySize(diagnostics.processTreeMemory.currentProcessRSS)}`);
  lines.push(`  Process Tree RSS: ${formatMemorySize(diagnostics.processTreeMemory.totalTreeRSS)}`);
  lines.push('');

  // Node.js Process
  lines.push('Node.js Process:');
  lines.push(`  Uptime: ${diagnostics.nodeProcess.uptime.toFixed(2)}s`);
  lines.push(`  Heap Used: ${(diagnostics.nodeProcess.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  lines.push(`  Heap Total: ${(diagnostics.nodeProcess.memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  lines.push(`  External: ${(diagnostics.nodeProcess.memoryUsage.external / 1024 / 1024).toFixed(2)} MB`);
  lines.push(`  Array Buffers: ${(diagnostics.nodeProcess.memoryUsage.arrayBuffers / 1024 / 1024).toFixed(2)} MB`);

  if (diagnostics.nodeProcess.resourceUsage) {
    const ru = diagnostics.nodeProcess.resourceUsage;
    lines.push(`  User CPU Time: ${ru.userCPUTime / 1000}ms`);
    lines.push(`  System CPU Time: ${ru.systemCPUTime / 1000}ms`);
    lines.push(`  Max RSS: ${(ru.maxRSS / 1024).toFixed(2)} MB`);
  }
  lines.push('');

  // Kernel Limits (macOS)
  if (process.platform === 'darwin') {
    lines.push('Kernel Limits (macOS):');
    if (diagnostics.kernelLimits.maxFiles !== null) {
      lines.push(`  Max Files (system): ${diagnostics.kernelLimits.maxFiles}`);
    }
    if (diagnostics.kernelLimits.maxFilesPerProcess !== null) {
      lines.push(`  Max Files per Process: ${diagnostics.kernelLimits.maxFilesPerProcess}`);
    }
    lines.push('');
  }

  // Environment
  lines.push('Environment:');
  lines.push(`  SHELL: ${diagnostics.environmentVariables.shell || 'not set'}`);
  lines.push(`  USER: ${diagnostics.environmentVariables.user || 'not set'}`);
  lines.push(`  HOME: ${diagnostics.environmentVariables.home || 'not set'}`);
  lines.push('');

  // Warnings
  if (diagnostics.warnings.length > 0) {
    lines.push('⚠️  WARNINGS:');
    diagnostics.warnings.forEach(warning => {
      lines.push(`  - ${warning}`);
    });
    lines.push('');
  }

  lines.push('=== END DIAGNOSTICS ===');

  return lines.join('\n');
}
