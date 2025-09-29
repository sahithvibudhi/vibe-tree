/**
 * Escapes a file path for shell use with proper quoting
 * @param path The file path to escape
 * @returns The escaped path ready for shell use
 */
export function escapeShellPath(path: string): string {
  // Check if path contains special characters that need escaping
  const needsQuoting = /[\s'"`$(){}[\]!#&*?;<>|\\]/.test(path);

  if (!needsQuoting) {
    return path;
  }

  // Escape single quotes by replacing ' with '\''
  const escaped = path.replace(/'/g, "'\\''");

  // Wrap in single quotes
  return `'${escaped}'`;
}