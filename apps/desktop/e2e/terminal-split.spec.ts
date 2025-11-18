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
  await expect(page.locator('h2', { hasText: 'Select a Project' })).toBeVisible({ timeout: 10000 });

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

  // Wait for worktree list to appear
  await page.waitForTimeout(3000);

  // Find and click the worktree button
  const worktreeButton = page.locator('button[data-worktree-branch="main"]');
  expect(await worktreeButton.count()).toBeGreaterThan(0);
  await worktreeButton.click();

  // Wait for the terminal to load
  await page.waitForTimeout(3000);
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
        DISABLE_QUIT_DIALOG: 'true'  // Prevent blocking on quit dialog
      },
      args: [testMainPath],
      cwd: appDir,
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
    await page.waitForTimeout(2000);

    // Verify we now have 2 terminals
    const splitTerminalCount = await page.locator('.claude-terminal-root').count();
    expect(splitTerminalCount).toBe(2);

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
    await page.waitForTimeout(1000);

    // Test typing in the second terminal
    const secondTerminalScreen = page.locator('.xterm-screen').nth(1);
    await secondTerminalScreen.click();
    await page.keyboard.type('echo "Terminal 2"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Verify the outputs in both terminals
    const firstTerminalContent = await firstTerminalScreen.textContent();
    expect(firstTerminalContent).toContain('Terminal 1');

    const secondTerminalContent = await secondTerminalScreen.textContent();
    expect(secondTerminalContent).toContain('Terminal 2');

    // Test closing a terminal
    const closeButton = page.locator('button[title="Close Terminal"]').first();
    await expect(closeButton).toBeVisible();
    await closeButton.click();

    // Wait for terminal to be closed
    await page.waitForTimeout(1000);

    // Verify we're back to 1 terminal
    const afterCloseCount = await page.locator('.claude-terminal-root').count();
    expect(afterCloseCount).toBe(1);

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
    const horizontalSplitButton = page.locator('button[title="Split Terminal Horizontally"]').first();
    await expect(horizontalSplitButton).toBeVisible();
    await horizontalSplitButton.click();

    // Wait for the new terminal to appear
    await page.waitForTimeout(2000);

    // Verify we now have 2 terminals
    const splitTerminalCount = await page.locator('.claude-terminal-root').count();
    expect(splitTerminalCount).toBe(2);

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

    // Each should take approximately 50% height
    const containerBox = await page.locator('.terminal-manager-root').boundingBox();
    const expectedHeight = (containerBox?.height || 0) / 2;
    expect(firstWrapperBox?.height).toBeCloseTo(expectedHeight, expectedHeight * 0.2); // Allow 20% tolerance
    expect(secondWrapperBox?.height).toBeCloseTo(expectedHeight, expectedHeight * 0.2);

    // Test typing in both terminals
    const firstTerminalScreen = page.locator('.xterm-screen').first();
    await firstTerminalScreen.click();
    await page.keyboard.type('echo "Terminal Top"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    const secondTerminalScreen = page.locator('.xterm-screen').nth(1);
    await secondTerminalScreen.click();
    await page.keyboard.type('echo "Terminal Bottom"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Verify the outputs
    const firstTerminalContent = await firstTerminalScreen.textContent();
    expect(firstTerminalContent).toContain('Terminal Top');

    const secondTerminalContent = await secondTerminalScreen.textContent();
    expect(secondTerminalContent).toContain('Terminal Bottom');
  });

  test('should maintain independent PTY sessions for split terminals', async () => {
    test.setTimeout(60000);

    await page.waitForLoadState('domcontentloaded');

    // Navigate to worktree terminal
    await navigateToWorktree(electronApp, page, dummyRepoPath);

    // Create a variable in the first terminal
    const firstTerminalScreen = page.locator('.xterm-screen').first();
    await firstTerminalScreen.click();
    await page.keyboard.type('export TEST_VAR_1="First Terminal"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Split the terminal
    const splitButton = page.locator('button[title="Split Terminal Vertically"]').first();
    await splitButton.click();
    await page.waitForTimeout(2000);

    // Create a different variable in the second terminal
    const secondTerminalScreen = page.locator('.xterm-screen').nth(1);
    await secondTerminalScreen.click();
    await page.keyboard.type('export TEST_VAR_2="Second Terminal"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Verify first terminal has its variable but not the second one
    await firstTerminalScreen.click();
    await page.keyboard.type('echo $TEST_VAR_1');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    let firstContent = await firstTerminalScreen.textContent();
    expect(firstContent).toContain('First Terminal');

    await firstTerminalScreen.click();
    await page.keyboard.type('echo $TEST_VAR_2');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    firstContent = await firstTerminalScreen.textContent();
    expect(firstContent).not.toContain('Second Terminal');

    // Verify second terminal has its variable but not the first one
    await secondTerminalScreen.click();
    await page.keyboard.type('echo $TEST_VAR_2');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    let secondContent = await secondTerminalScreen.textContent();
    expect(secondContent).toContain('Second Terminal');

    await secondTerminalScreen.click();
    await page.keyboard.type('echo $TEST_VAR_1');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    secondContent = await secondTerminalScreen.textContent();
    expect(secondContent).not.toContain('First Terminal');
  });
});