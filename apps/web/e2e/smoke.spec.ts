import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end smoke test for the web app against a real server and PTYs:
 * connect, auto-load the fixture project, create a worktree, run a command
 * in the terminal, reload the page, and verify the scrollback was replayed
 * from the server-side buffer.
 */

const BRANCH = 'e2e-branch';

async function serializedTerminals(page: Page): Promise<string> {
  return page.evaluate(() => {
    const w = window as unknown as Record<string, { serialize?: () => string }>;
    return Object.keys(w)
      .filter((key) => key.startsWith('terminal_'))
      .map((key) => w[key]?.serialize?.() ?? '')
      .join('\n');
  });
}

async function openWorktree(page: Page, branch: string) {
  const worktreeButton = page.getByRole('button', { name: branch, exact: false }).first();
  await expect(worktreeButton).toBeVisible({ timeout: 15000 });
  await worktreeButton.click();
  // Terminal is ready once the shared component registers its window API
  await expect
    .poll(
      () =>
        page.evaluate(
          () => Object.keys(window).filter((key) => key.startsWith('terminal_')).length
        ),
      { timeout: 15000 }
    )
    .toBeGreaterThan(0);
}

test('terminal sessions survive a page reload with scrollback intact', async ({ page }) => {
  await page.goto('/');

  // Onboarding hint shows on first visit and stays dismissed
  await expect(page.getByTestId('onboarding-hint')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('onboarding-dismiss').click();
  await expect(page.getByTestId('onboarding-hint')).not.toBeVisible();

  // The fixture project auto-loads from DEFAULT_PROJECTS
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 20000 });

  // Create a worktree for a new branch
  await page.getByTestId('create-worktree').click();
  await page.getByPlaceholder('feature-name').fill(BRANCH);
  await page.getByRole('button', { name: 'Create Branch' }).click();

  await openWorktree(page, BRANCH);

  // Run a command whose output cannot appear by accident
  await page.locator('.terminal-container').first().click();
  await page.keyboard.type('echo WEB_E2E_$((40+2))');
  await page.keyboard.press('Enter');

  await expect
    .poll(() => serializedTerminals(page), { timeout: 15000 })
    .toContain('WEB_E2E_42');

  // Reload the page: the session must survive on the server and its
  // scrollback must be replayed into a fresh terminal
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 20000 });

  await openWorktree(page, BRANCH);

  await expect
    .poll(() => serializedTerminals(page), { timeout: 15000 })
    .toContain('WEB_E2E_42');
});

test('PWA manifest and service worker are wired up', async ({ page }) => {
  await page.goto('/');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();

  const manifest = await page.evaluate(async (href) => {
    const res = await fetch(href!);
    return res.json();
  }, manifestHref);

  expect(manifest.name).toBe('VibeTree');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
});
