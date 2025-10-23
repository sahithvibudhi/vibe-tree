import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import { closeElectronApp } from './helpers/test-launcher';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Worktree Terminal Content Preservation', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath: string;
  let wt1Path: string;

  test.beforeEach(async () => {
    // Create a dummy git repository with one worktree
    const timestamp = Date.now();
    dummyRepoPath = path.join(os.tmpdir(), `dummy-repo-${timestamp}`);
    
    // Create the directory and initialize git repo
    fs.mkdirSync(dummyRepoPath, { recursive: true });
    execSync('git init -q', { cwd: dummyRepoPath });
    execSync('git config user.email "test@example.com"', { cwd: dummyRepoPath });
    execSync('git config user.name "Test User"', { cwd: dummyRepoPath });
    
    // Create a dummy file and make initial commit (required for worktrees)
    fs.writeFileSync(path.join(dummyRepoPath, 'README.md'), '# Test Repository\n');
    execSync('git add .', { cwd: dummyRepoPath });
    execSync('git commit -q -m "Initial commit"', { cwd: dummyRepoPath });
    
    // Create wt1 worktree directory
    wt1Path = path.join(os.tmpdir(), `dummy-repo-wt1-${timestamp}`);
    
    // Create wt1 worktree with a new branch
    execSync(`git worktree add -b wt1 "${wt1Path}"`, { cwd: dummyRepoPath });
    
    console.log('Created dummy repo with main and wt1 branches at:', dummyRepoPath);

    const testMainPath = path.join(__dirname, '../dist/main/test-index.js');
    console.log('Using test main file:', testMainPath);

    electronApp = await electron.launch({
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TEST_MODE: 'true',
        DISABLE_QUIT_DIALOG: 'true'  // Prevent blocking on quit dialog
      },
      args: [testMainPath],
    });

    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  }, 45000);

  test.afterEach(async () => {
    if (electronApp) {
      await closeElectronApp(electronApp);
    }
    
    // Clean up the worktree directory first
    if (wt1Path && fs.existsSync(wt1Path)) {
      try {
        fs.rmSync(wt1Path, { recursive: true, force: true });
        console.log('Cleaned up wt1 worktree');
      } catch (e) {
        console.error('Failed to clean up wt1 worktree:', e);
      }
    }
    
    // Clean up the dummy repository
    if (dummyRepoPath && fs.existsSync(dummyRepoPath)) {
      try {
        fs.rmSync(dummyRepoPath, { recursive: true, force: true });
        console.log('Cleaned up dummy repo');
      } catch (e) {
        console.error('Failed to clean up dummy repo:', e);
      }
    }
  });

  test('should preserve terminal content when switching between worktrees', async () => {
    test.setTimeout(60000);
    
    // Note: With react-reverse-portal implementation, only the current terminal
    // is present in the DOM via OutPortal. Other terminals are kept alive
    // in their InPortal containers but not visible in the DOM.

    await page.waitForLoadState('domcontentloaded');

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
    }, dummyRepoPath);

    // Click the open button which will trigger the mocked dialog
    await openButton.click();

    // Wait for worktree list to appear
    await page.waitForTimeout(3000);

    // Step 1: Stay on main branch and type echo SIGNAL
    console.log('\n=== STEP 1: TYPING "echo SIGNAL" IN MAIN BRANCH TERMINAL ===');
    
    // Verify we're on main branch by checking the active worktree
    const mainButton = page.locator('button[data-worktree-branch="main"], button[data-worktree-branch="master"]');
    const mainCount = await mainButton.count();
    console.log(`Found ${mainCount} main/master button(s)`);
    
    // Click the main button to select it and show the terminal
    console.log('Clicking main button to select worktree...');
    await mainButton.click();
    await page.waitForTimeout(2000); // Wait for terminal to load
    
    // Find and click the terminal to ensure it's focused
    let terminalContainers = page.locator('.xterm-screen');
    let terminalCount = await terminalContainers.count();
    console.log(`Terminal count in main: ${terminalCount}`);
    expect(terminalCount).toBe(1);
    
    const mainTerminal = terminalContainers.first();
    console.log('Clicking main terminal to focus...');
    await mainTerminal.click();
    await page.waitForTimeout(500);
    
    // Type the echo SIGNAL command
    console.log('Typing: echo SIGNAL');
    await page.keyboard.type('echo SIGNAL');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    // Capture the terminal content for verification
    const mainTerminalContentBefore = await mainTerminal.textContent();
    console.log(`Main terminal content preview: ${mainTerminalContentBefore?.substring(0, 200)}...`);
    expect(mainTerminalContentBefore).toContain('SIGNAL');
    console.log('✓ Verified SIGNAL is present in main terminal');

    // Step 2: Switch to wt1
    console.log('\n=== STEP 2: SWITCHING TO WT1 ===');
    const wt1Button = page.locator('button[data-worktree-branch="wt1"]');
    const wt1Count = await wt1Button.count();
    console.log(`Found ${wt1Count} wt1 button(s)`);
    
    if (wt1Count === 0) {
      // Log all buttons to debug
      const allButtons = await page.locator('button').all();
      console.log('All buttons on page:');
      for (const btn of allButtons) {
        const text = await btn.textContent();
        const attrs = await btn.evaluate(el => Array.from(el.attributes).map(a => `${a.name}="${a.value}"`).join(' '));
        console.log(`  - Button: ${text?.trim() || '(no text)'} | Attrs: ${attrs}`);
      }
      throw new Error('Could not find wt1 worktree button');
    }
    
    console.log('Clicking wt1 button...');
    await wt1Button.click();
    console.log('Waiting 3 seconds for worktree to load...');
    await page.waitForTimeout(3000);

    // Verify we have a terminal in wt1
    console.log('\n--- Checking terminal in wt1 ---');
    terminalContainers = page.locator('.xterm-screen');
    terminalCount = await terminalContainers.count();
    console.log(`Terminal count in wt1: ${terminalCount}`);
    
    // With react-reverse-portal, only the current terminal is in the DOM via OutPortal
    expect(terminalCount).toBe(1);
    
    // Verify the terminal is visible
    const visibleTerminals = page.locator('.xterm-screen:visible');
    const visibleCount = await visibleTerminals.count();
    expect(visibleCount).toBe(1);
    console.log(`Visible terminal count in wt1: ${visibleCount}`);
    
    // Type something in wt1 terminal to make it distinct
    // Find the visible terminal
    const wt1Terminal = page.locator('.xterm-screen:visible').first();
    await wt1Terminal.click();
    await page.waitForTimeout(500);
    await page.keyboard.type('echo "This is wt1"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    const wt1TerminalContent = await wt1Terminal.textContent();
    console.log(`wt1 terminal content preview: ${wt1TerminalContent?.substring(0, 100)}...`);
    expect(wt1TerminalContent).toContain('This is wt1');

    // Step 3: Switch back to main
    console.log('\n=== STEP 3: SWITCHING BACK TO MAIN ===');
    
    // Find and click the main button again
    console.log('Clicking main button to switch back...');
    await mainButton.click();
    console.log('Waiting 3 seconds for worktree to load...');
    await page.waitForTimeout(3000);

    // Step 4: Verify terminal still contains SIGNAL
    console.log('\n--- Verifying terminal content preservation in main ---');
    terminalContainers = page.locator('.xterm-screen');
    terminalCount = await terminalContainers.count();
    console.log(`Terminal count in main (after switch back): ${terminalCount}`);
    
    // With react-reverse-portal, only the current terminal is in the DOM via OutPortal
    expect(terminalCount).toBe(1);
    
    // Verify the terminal is visible
    const visibleTerminalsAfter = page.locator('.xterm-screen:visible');
    const visibleCountAfter = await visibleTerminalsAfter.count();
    expect(visibleCountAfter).toBe(1);
    console.log(`Visible terminal count in main (after switch back): ${visibleCountAfter}`);
    
    const mainTerminalAfter = page.locator('.xterm-screen:visible').first();
    const mainTerminalContentAfter = await mainTerminalAfter.textContent();
    console.log(`Main terminal content after switching back: ${mainTerminalContentAfter?.substring(0, 200)}...`);
    
    // Verify SIGNAL is still present
    expect(mainTerminalContentAfter).toContain('SIGNAL');
    console.log('✓ Verified SIGNAL is still present in main terminal after switching back');
    
    // Additional verification: ensure it doesn't contain wt1 content
    expect(mainTerminalContentAfter).not.toContain('This is wt1');
    console.log('✓ Verified main terminal does not contain wt1 content');
    
    console.log('\n✓✓✓ TEST PASSED: Terminal content is preserved when switching between worktrees ✓✓✓');
    console.log('Summary:');
    console.log('  - Main branch terminal content (SIGNAL) was preserved');
    console.log('  - Terminal states are isolated between worktrees');
    console.log('  - No cross-contamination of terminal content');
  });
});