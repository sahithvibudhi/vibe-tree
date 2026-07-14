import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ForegroundProcessInfo {
  pid: number | null;
  command: string | null;
}

/**
 * Find the foreground child process of a shell PID.
 * Used to detect whether an AI CLI (or any long-running program)
 * is active inside a terminal session. POSIX only; on other
 * platforms this reports no child rather than failing.
 */
export async function getForegroundProcessForPid(shellPid: number): Promise<ForegroundProcessInfo> {
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    return { pid: null, command: null };
  }

  try {
    const { stdout: childPidOutput } = await execAsync(`pgrep -P ${shellPid}`, {
      encoding: 'utf-8'
    });

    const childPid = parseInt(childPidOutput.trim().split('\n')[0], 10);
    if (isNaN(childPid)) {
      return { pid: null, command: null };
    }

    const { stdout: commandOutput } = await execAsync(`ps -o comm= -p ${childPid}`, {
      encoding: 'utf-8'
    });

    return { pid: childPid, command: commandOutput.trim() || null };
  } catch {
    return { pid: null, command: null };
  }
}
