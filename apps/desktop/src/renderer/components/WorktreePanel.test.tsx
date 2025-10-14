import { describe, it, expect } from 'vitest';
import { isProtectedBranch } from '../utils/worktree';

describe('WorktreePanel - Branch Protection Logic', () => {
  describe('isProtectedBranch', () => {
    it('should protect exact "main" branch', () => {
      expect(isProtectedBranch('refs/heads/main')).toBe(true);
    });

    it('should protect exact "master" branch', () => {
      expect(isProtectedBranch('refs/heads/master')).toBe(true);
    });

    it('should NOT protect branches containing "main" as substring', () => {
      expect(isProtectedBranch('refs/heads/fix-broken-main3')).toBe(false);
      expect(isProtectedBranch('refs/heads/maintain-feature')).toBe(false);
      expect(isProtectedBranch('refs/heads/domain-logic')).toBe(false);
      expect(isProtectedBranch('refs/heads/remain-stable')).toBe(false);
      expect(isProtectedBranch('refs/heads/main-feature')).toBe(false);
      expect(isProtectedBranch('refs/heads/feature-main')).toBe(false);
    });

    it('should NOT protect branches containing "master" as substring', () => {
      expect(isProtectedBranch('refs/heads/masterful-feature')).toBe(false);
      expect(isProtectedBranch('refs/heads/remaster-audio')).toBe(false);
      expect(isProtectedBranch('refs/heads/master-branch-fix')).toBe(false);
      expect(isProtectedBranch('refs/heads/feature-master')).toBe(false);
    });

    it('should allow deletion of feature branches', () => {
      expect(isProtectedBranch('refs/heads/feature/new-ui')).toBe(false);
      expect(isProtectedBranch('refs/heads/fix/bug-123')).toBe(false);
      expect(isProtectedBranch('refs/heads/develop')).toBe(false);
      expect(isProtectedBranch('refs/heads/staging')).toBe(false);
    });

    it('should handle edge cases', () => {
      // Empty branch name (shouldn't happen in practice, but test defensive behavior)
      expect(isProtectedBranch('refs/heads/')).toBe(false);

      // Branch without refs/heads prefix (shouldn't happen, but test it anyway)
      expect(isProtectedBranch('main')).toBe(true);
      expect(isProtectedBranch('master')).toBe(true);
      expect(isProtectedBranch('fix-broken-main3')).toBe(false);
    });

    it('should handle case sensitivity correctly', () => {
      // Git branch names are case-sensitive
      expect(isProtectedBranch('refs/heads/Main')).toBe(false);
      expect(isProtectedBranch('refs/heads/MAIN')).toBe(false);
      expect(isProtectedBranch('refs/heads/Master')).toBe(false);
      expect(isProtectedBranch('refs/heads/MASTER')).toBe(false);
    });
  });

  describe('Delete button visibility logic', () => {
    it('should show delete button for non-protected branches when multiple worktrees exist', () => {
      const worktree = {
        path: '/path/to/worktree',
        branch: 'refs/heads/feature-branch',
        head: 'abc123'
      };
      const worktreeCount = 2;

      const shouldShowDeleteButton =
        worktreeCount > 1 &&
        worktree.branch &&
        !isProtectedBranch(worktree.branch);

      expect(shouldShowDeleteButton).toBe(true);
    });

    it('should hide delete button for main branch even with multiple worktrees', () => {
      const worktree = {
        path: '/path/to/worktree',
        branch: 'refs/heads/main',
        head: 'abc123'
      };
      const worktreeCount = 2;

      const shouldShowDeleteButton =
        worktreeCount > 1 &&
        worktree.branch &&
        !isProtectedBranch(worktree.branch);

      expect(shouldShowDeleteButton).toBe(false);
    });

    it('should hide delete button when only one worktree exists', () => {
      const worktree = {
        path: '/path/to/worktree',
        branch: 'refs/heads/feature-branch',
        head: 'abc123'
      };
      const worktreeCount = 1;

      const shouldShowDeleteButton =
        worktreeCount > 1 &&
        worktree.branch &&
        !isProtectedBranch(worktree.branch);

      expect(shouldShowDeleteButton).toBe(false);
    });

    it('should show delete button for branches with "main" substring (bug fix verification)', () => {
      // This is the specific bug we're fixing
      const problematicBranches = [
        'refs/heads/fix-broken-main3',
        'refs/heads/maintain-feature',
        'refs/heads/domain-logic',
      ];
      const worktreeCount = 2;

      problematicBranches.forEach(branch => {
        const worktree = {
          path: '/path/to/worktree',
          branch,
          head: 'abc123'
        };

        const shouldShowDeleteButton =
          worktreeCount > 1 &&
          worktree.branch &&
          !isProtectedBranch(worktree.branch);

        expect(shouldShowDeleteButton).toBe(true);
      });
    });
  });
});
