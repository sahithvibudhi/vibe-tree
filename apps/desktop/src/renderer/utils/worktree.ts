/**
 * Determines if a branch should be protected from deletion
 * @param branchRef - Branch reference (e.g., "refs/heads/main" or "main")
 * @returns true if the branch is protected (exactly "main" or "master")
 */
export function isProtectedBranch(branchRef: string): boolean {
  const branchName = branchRef.replace('refs/heads/', '');
  return branchName === 'main' || branchName === 'master';
}
