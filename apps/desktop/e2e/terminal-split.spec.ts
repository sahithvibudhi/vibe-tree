import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import { closeElectronApp } from './helpers/test-launcher';
import { createTestGitRepo, cleanupTestGitRepo } from './helpers/test-git-repo';
import path from 'path';

/**
 * Helper function to navigate to terminal view for a worktree
 */
async function navigateToWorktree(electronApp: ElectronApplication, page: Page, repoPath: string) {
  // Verify the app launches with project selector
  await expect(page.locator('h2', { hasText: 'Open a project' })).toBeVisible({ timeout: 10000 });

  // Click the "Open Project Folder" button
  const openButton = page.locator('button', { hasText: 'Open Project Folder' });
  await expect(openButton).toBeVisible();

  // Mock the Electron dialog to return our dummy repository path
  await electronApp.evaluate(async ({ dialog }, repoPath) => {
    dialog.showOpenDialog = async () => {
      return {
        canceled: false,
        filePaths: [repoPath]
      };
    };
  }, repoPath);

  // Click the open button which will trigger the mocked dialog
  await openButton.click();

  // Wait for the worktree list to appear
  const worktreeButton = page.locator('button[data-worktree-branch="main"]');
  await expect(worktreeButton.first()).toBeVisible({ timeout: 15000 });
  await worktreeButton.first().click();

  // Wait for the terminal to load
  await expect(page.locator('.xterm-screen').first()).toBeVisible({ timeout: 15000 });
}

test.describe('Terminal Split Feature', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath: string;

  test.beforeEach(async () => {
    // Create a dummy git repository for testing
    const { repoPath } = createTestGitRepo({ nameSuffix: 'repo-split' });
    dummyRepoPath = repoPath;

    const testMainPath = path.join(__dirname, '../dist/main/test-index.js');
    console.log('Using test main file:', testMainPath);

    // In CI, we need to specify the app directory explicitly
    const appDir = path.join(__dirname, '..');

    electronApp = await electron.launch({
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TEST_MODE: 'true',
        DISABLE_QUIT_DIALOG: 'true' // Prevent blocking on quit dialog
      },
      args: [testMainPath],
      cwd: appDir
    });

    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  }, 45000);

  test.afterEach(async () => {
    if (electronApp) {
      await closeElectronApp(electronApp);
    }

    // Clean up the dummy repository
    cleanupTestGitRepo(dummyRepoPath);
  });

  test('should split terminal and manage multiple terminals', async () => {
    test.setTimeout(60000);

    await page.waitForLoadState('domcontentloaded');

    // Navigate to worktree terminal
    await navigateToWorktree(electronApp, page, dummyRepoPath);

    // Verify initial terminal is present
    const initialTerminal = page.locator('.claude-terminal-root').first();
    await expect(initialTerminal).toBeVisible();

    // Count initial terminals (should be 1)
    const initialTerminalCount = await page.locator('.claude-terminal-root').count();
    expect(initialTerminalCount).toBe(1);

    // Find and click the split button (Columns2 icon button)
    const splitButton = page.locator('button[title="Split Terminal Vertically"]').first();
    await expect(splitButton).toBeVisible();
    await splitButton.click();

    // Wait for the new terminal to appear
    await expect(page.locator('.claude-terminal-root')).toHaveCount(2, { timeout: 10000 });

    // Verify both terminals are visible
    const terminals = page.locator('.claude-terminal-root');
    for (let i = 0; i < 2; i++) {
      await expect(terminals.nth(i)).toBeVisible();
    }

    // Test typing in the first terminal
    const firstTerminalScreen = page.locator('.xterm-screen').first();
    await firstTerminalScreen.click();
    await page.keyboard.type('echo "Terminal 1"');
    await page.keyboard.press('Enter');
    await expect(firstTerminalScreen).toContainText('Terminal 1', { timeout: 10000 });

    // Test typing in the second terminal
    const secondTerminalScreen = page.locator('.xterm-screen').nth(1);
    await secondTerminalScreen.click();
    await page.keyboard.type('echo "Terminal 2"');
    await page.keyboard.press('Enter');
    await expect(secondTerminalScreen).toContainText('Terminal 2', { timeout: 10000 });

    // Test closing a terminal
    const closeButton = page.locator('button[title="Close Terminal"]').first();
    await expect(closeButton).toBeVisible();
    await closeButton.click();

    // Wait for the terminal to be closed
    await expect(page.locator('.claude-terminal-root')).toHaveCount(1, { timeout: 10000 });

    // Verify the close button is visible but disabled when only one terminal remains
    const closeButtonAfter = page.locator('button[title="Cannot close last terminal"]').first();
    await expect(closeButtonAfter).toBeVisible();
    await expect(closeButtonAfter).toBeDisabled();

    // Verify split button is still available
    const splitButtonAfter = page.locator('button[title="Split Terminal Vertically"]').first();
    await expect(splitButtonAfter).toBeVisible();
  });

  test('should split terminal horizontally and manage multiple terminals', async () => {
    test.setTimeout(60000);

    await page.waitForLoadState('domcontentloaded');

    // Navigate to worktree terminal
    await navigateToWorktree(electronApp, page, dummyRepoPath);

    // Verify initial terminal is present
    const initialTerminal = page.locator('.claude-terminal-root').first();
    await expect(initialTerminal).toBeVisible();

    // Count initial terminals (should be 1)
    const initialTerminalCount = await page.locator('.claude-terminal-root').count();
    expect(initialTerminalCount).toBe(1);

    // Find and click the horizontal split button (Rows2 icon button)
    const horizontalSplitButton = page
      .locator('button[title="Split Terminal Horizontally"]')
      .first();
    await expect(horizontalSplitButton).toBeVisible();
    await horizontalSplitButton.click();

    // Wait for the new terminal to appear
    await expect(page.locator('.claude-terminal-root')).toHaveCount(2, { timeout: 10000 });

    // Verify both terminals are visible and stacked vertically
    const terminals = page.locator('.claude-terminal-root');
    for (let i = 0; i < 2; i++) {
      await expect(terminals.nth(i)).toBeVisible();
    }

    // Verify the terminals are arranged horizontally (stacked vertically)
    const terminalWrappers = page.locator('.terminal-outportal-wrapper');
    const firstWrapperBox = await terminalWrappers.first().boundingBox();
    const secondWrapperBox = await terminalWrappers.nth(1).boundingBox();

    // In horizontal split, terminals should be stacked (same x, different y)
    expect(firstWrapperBox?.x).toBeCloseTo(secondWrapperBox?.x || 0, 1);
    expect(firstWrapperBox?.y).toBeLessThan(secondWrapperBox?.y || 0);

    // Each should take approximately 50% height; the draggable divider
    // between the panes takes a few pixels of its own
    const containerBox = await page.locator('.terminal-manager-root').boundingBox();
    const dividerBox = await page.locator('[data-testid="split-divider"]').boundingBox();
    const expectedHeight = ((containerBox?.height || 0) - (dividerBox?.height || 0)) / 2;
    // toBeCloseTo's second argument is decimal digits, not a tolerance, so
    // assert the difference directly (allow 10% for rounding and borders)
    expect(Math.abs((firstWrapperBox?.height || 0) - expectedHeight)).toBeLessThanOrEqual(
      expectedHeight * 0.1
    );
    expect(Math.abs((secondWrapperBox?.height || 0) - expectedHeight)).toBeLessThanOrEqual(
      expectedHeight * 0.1
    );

    // Test typing in both terminals
    const firstTerminalScreen = page.locator('.xterm-screen').first();
    await firstTerminalScreen.click();
    await page.keyboard.type('echo "Terminal Top"');
    await page.keyboard.press('Enter');
    await expect(firstTerminalScreen).toContainText('Terminal Top', { timeout: 10000 });

    const secondTerminalScreen = page.locator('.xterm-screen').nth(1);
    await secondTerminalScreen.click();
    await page.keyboard.type('echo "Terminal Bottom"');
    await page.keyboard.press('Enter');
    await expect(secondTerminalScreen).toContainText('Terminal Bottom', { timeout: 10000 });
  });

  test('should maintain independent PTY sessions for split terminals', async () => {
    test.setTimeout(60000);

    await page.waitForLoadState('domcontentloaded');

    // Navigate to worktree terminal
    await navigateToWorktree(electronApp, page, dummyRepoPath);

    // Create a variable in the first terminal; the DONE marker signals the
    // shell processed the line, replacing arbitrary sleeps
    const firstTerminalScreen = page.locator('.xterm-screen').first();
    await firstTerminalScreen.click();
    await page.keyboard.type('export TEST_VAR_1="First Terminal"; echo SET_DONE_1');
    await page.keyboard.press('Enter');
    await expect(firstTerminalScreen).toContainText('SET_DONE_1', { timeout: 10000 });

    // Split the terminal
    const splitButton = page.locator('button[title="Split Terminal Vertically"]').first();
    await splitButton.click();
    await expect(page.locator('.claude-terminal-root')).toHaveCount(2, { timeout: 10000 });

    // Create a different variable in the second terminal
    const secondTerminalScreen = page.locator('.xterm-screen').nth(1);
    await secondTerminalScreen.click();
    await page.keyboard.type('export TEST_VAR_2="Second Terminal"; echo SET_DONE_2');
    await page.keyboard.press('Enter');
    await expect(secondTerminalScreen).toContainText('SET_DONE_2', { timeout: 10000 });

    // Verify first terminal has its variable but not the second one
    await firstTerminalScreen.click();
    await page.keyboard.type('echo "V1=$TEST_VAR_1"; echo "V2=$TEST_VAR_2"; echo PROBE_DONE_1');
    await page.keyboard.press('Enter');
    await expect(firstTerminalScreen).toContainText('PROBE_DONE_1', { timeout: 10000 });

    const firstContent = (await firstTerminalScreen.textContent()) || '';
    expect(firstContent).toContain('V1=First Terminal');
    expect(firstContent).not.toContain('V2=Second Terminal');

    // Verify second terminal has its variable but not the first one
    await secondTerminalScreen.click();
    await page.keyboard.type('echo "V1=$TEST_VAR_1"; echo "V2=$TEST_VAR_2"; echo PROBE_DONE_2');
    await page.keyboard.press('Enter');
    await expect(secondTerminalScreen).toContainText('PROBE_DONE_2', { timeout: 10000 });

    const secondContent = (await secondTerminalScreen.textContent()) || '';
    expect(secondContent).toContain('V2=Second Terminal');
    expect(secondContent).not.toContain('V1=First Terminal');
  });
});
