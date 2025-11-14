import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import { closeElectronApp } from './helpers/test-launcher';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Terminal Settings', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath: string;

  test.beforeEach(async () => {
    // Create a dummy git repository for testing
    const timestamp = Date.now();
    dummyRepoPath = path.join(os.tmpdir(), `dummy-repo-settings-${timestamp}`);

    // Create the directory and initialize git repo
    fs.mkdirSync(dummyRepoPath, { recursive: true });
    execSync('git init -q', { cwd: dummyRepoPath });
    execSync('git config user.email "test@example.com"', { cwd: dummyRepoPath });
    execSync('git config user.name "Test User"', { cwd: dummyRepoPath });

    // Create a dummy file and make initial commit
    fs.writeFileSync(path.join(dummyRepoPath, 'README.md'), '# Test Repository\n');
    execSync('git add .', { cwd: dummyRepoPath });
    execSync('git commit -q -m "Initial commit"', { cwd: dummyRepoPath });

    console.log(`Created dummy repo at: ${dummyRepoPath}`);

    // Use test index if available
    const testMainPath = path.join(__dirname, '../dist/main/test-index.js');
    const mainPath = fs.existsSync(testMainPath) ? testMainPath : path.join(__dirname, '..');

    console.log(`Using test main file: ${mainPath}`);

    // Launch Electron app
    electronApp = await electron.launch({
      args: [mainPath],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TEST_MODE: 'true',
        DISABLE_QUIT_DIALOG: 'true'  // Prevent blocking on quit dialog
      },
    });

    // Get the first window that opens
    page = await electronApp.firstWindow();

    // Wait for the page to be ready
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

    // Click the worktree button to open the terminal
    const worktreeButton = page.locator('button[data-worktree-branch="main"], button[data-worktree-branch="master"]').first();
    await expect(worktreeButton).toBeVisible({ timeout: 10000 });
    await worktreeButton.click();

    // Wait for terminal to appear
    await page.waitForSelector('.claude-terminal-root', { timeout: 10000 });
  });

  test.afterEach(async () => {
    // Close the app
    if (electronApp) {
      await closeElectronApp(electronApp);
    }

    // Clean up the dummy repository
    if (dummyRepoPath && fs.existsSync(dummyRepoPath)) {
      fs.rmSync(dummyRepoPath, { recursive: true, force: true });
      console.log('Cleaned up dummy repo');
    }
  });

  test('should open terminal settings from menu and persist font changes', async () => {
    // Check if window.electronAPI exists
    const hasAPI = await page.evaluate(() => {
      return typeof window.electronAPI !== 'undefined' &&
             typeof window.electronAPI.menu !== 'undefined' &&
             typeof window.electronAPI.menu.onOpenTerminalSettings !== 'undefined';
    });
    console.log('electronAPI.menu.onOpenTerminalSettings available:', hasAPI);

    // Try triggering through the API directly
    await page.evaluate(() => {
      // Create a promise to wait for the event to be triggered
      return new Promise<void>((resolve) => {
        // Set up listener first
        const unsubscribe = window.electronAPI.menu.onOpenTerminalSettings(() => {
          console.log('Terminal settings event received in test');
          unsubscribe();
          resolve();
        });

        // Now trigger the event from the main process through IPC
        setTimeout(() => {
          // If not resolved within 1 second, resolve anyway
          resolve();
        }, 1000);
      });
    });

    // Send the IPC event from main process
    await electronApp.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      windows[0].webContents.send('menu:open-terminal-settings');
    });

    // Wait for dialog to appear
    await page.waitForTimeout(1000);

    // Check if dialog is visible now
    const dialogVisible = await page.locator('[role="dialog"]').isVisible().catch(() => false);
    console.log('Dialog visible after IPC:', dialogVisible);

    if (!dialogVisible) {
      // Try a different approach - look for the actual dialog content
      const anyDialogContent = await page.evaluate(() => {
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          if (el.textContent?.includes('Terminal Settings') &&
              el.textContent?.includes('Font Family')) {
            return true;
          }
        }
        return false;
      });
      console.log('Found dialog content in DOM:', anyDialogContent);

      if (!anyDialogContent) {
        throw new Error('Settings dialog did not appear');
      }
    }

    // Wait for dialog to be ready
    await page.waitForSelector('[role="dialog"], h2:has-text("Terminal Settings")', { timeout: 5000 });

    // Verify the dialog title
    const dialogTitle = await page.textContent('h2:has-text("Terminal Settings")');
    expect(dialogTitle).toContain('Terminal Settings');

    // Verify the description mentions universal settings
    const description = await page.textContent('text=/Changes apply universally/');
    expect(description).toBeTruthy();

    // Test font family selection
    const fontSelect = await page.locator('select#fontFamily');
    await expect(fontSelect).toBeVisible();

    // Change to a different font
    const newFont = '"Cascadia Code", Menlo, Monaco, monospace';
    await fontSelect.selectOption(newFont);

    // Test font size change
    const fontSizeInput = await page.locator('input#fontSize');
    await expect(fontSizeInput).toBeVisible();

    // Clear and set new font size
    await fontSizeInput.fill('16');

    // Test cursor blink toggle
    const cursorBlinkCheckbox = await page.locator('input#cursorBlink');
    await expect(cursorBlinkCheckbox).toBeVisible();
    const initialBlinkState = await cursorBlinkCheckbox.isChecked();
    await cursorBlinkCheckbox.click();

    // Test scrollback buffer
    const scrollbackInput = await page.locator('input#scrollback');
    await expect(scrollbackInput).toBeVisible();
    await scrollbackInput.fill('5000');

    // Test tab width
    const tabWidthInput = await page.locator('input#tabStopWidth');
    await expect(tabWidthInput).toBeVisible();
    await tabWidthInput.fill('2');

    // Click Done button to close dialog
    await page.click('button:has-text("Done")');

    // Verify dialog is closed
    await expect(page.locator('[role="dialog"]')).toBeHidden();

    // Verify settings are persisted by checking the settings file
    const userDataPath = await electronApp.evaluate(async ({ app }) => {
      return app.getPath('userData');
    });

    const settingsPath = path.join(userDataPath, 'terminal-settings.json');

    // Wait a moment for settings to be saved
    await page.waitForTimeout(500);

    // Verify settings file exists
    expect(fs.existsSync(settingsPath)).toBeTruthy();

    // Verify settings file contains our changes
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(settings.fontFamily).toBe(newFont);
    expect(settings.fontSize).toBe(16);
    expect(settings.cursorBlink).toBe(!initialBlinkState);
    expect(settings.scrollback).toBe(5000);
    expect(settings.tabStopWidth).toBe(2);

    // Re-open settings to verify persistence
    await electronApp.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        windows[0].webContents.send('menu:open-terminal-settings');
      }
    });

    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Verify settings are loaded correctly
    await expect(fontSelect).toHaveValue(newFont);
    await expect(fontSizeInput).toHaveValue('16');
    await expect(cursorBlinkCheckbox).toBeChecked({ checked: !initialBlinkState });
    await expect(scrollbackInput).toHaveValue('5000');
    await expect(tabWidthInput).toHaveValue('2');

    // Test Reset to Defaults
    await page.click('button:has-text("Reset to Defaults")');

    // Wait for reset to apply
    await page.waitForTimeout(500);

    // Verify defaults are restored
    await expect(fontSelect).toHaveValue('Menlo, Monaco, "Courier New", monospace');
    await expect(fontSizeInput).toHaveValue('14');
    await expect(cursorBlinkCheckbox).toBeChecked();
    await expect(scrollbackInput).toHaveValue('10000');
    await expect(tabWidthInput).toHaveValue('4');

    // Close dialog
    await page.click('button:has-text("Done")');
  });

  test('should apply font settings to all terminals', async () => {
    // Open terminal settings
    await electronApp.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        windows[0].webContents.send('menu:open-terminal-settings');
      }
    });

    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Change font size to something distinctive
    const fontSizeInput = await page.locator('input#fontSize');
    await fontSizeInput.fill('18');

    // Close dialog
    await page.click('button:has-text("Done")');

    // Verify the terminal has the new font size applied
    // This would require checking the actual terminal element's computed styles
    const terminalElement = await page.locator('.xterm').first();
    const fontSize = await terminalElement.evaluate(el => {
      const computedStyle = window.getComputedStyle(el);
      return computedStyle.fontSize;
    });

    // The font size should be 18px (or scaled equivalent)
    expect(fontSize).toBeTruthy();
    // Verify font size matches what we set (accounting for potential scaling)
    expect(parseFloat(fontSize)).toBeGreaterThan(14);
  });

  test('should handle custom font input', async () => {
    // Open terminal settings
    await electronApp.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        windows[0].webContents.send('menu:open-terminal-settings');
      }
    });

    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Select "Custom Font..." option
    const fontSelect = await page.locator('select#fontFamily');
    await fontSelect.selectOption('custom');

    // Custom font input should appear
    const customFontInput = await page.locator('input#customFont');
    await expect(customFontInput).toBeVisible();

    // Enter a custom font
    const customFont = '"Fira Code", "Cascadia Code", monospace';
    await customFontInput.fill(customFont);

    // Apply the custom font
    await page.click('button:has-text("Apply")');

    // Wait for the change to be applied
    await page.waitForTimeout(500);

    // Close and reopen to verify persistence
    await page.click('button:has-text("Done")');
    await page.waitForSelector('[role="dialog"]', { state: 'hidden' });

    // Reopen settings
    await electronApp.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        windows[0].webContents.send('menu:open-terminal-settings');
      }
    });

    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // The custom font should be shown in the custom font input
    // since it's not in the predefined list
    const customFontInputAgain = await page.locator('input#customFont');
    await expect(customFontInputAgain).toBeVisible();

    // Close dialog
    await page.click('button:has-text("Done")');
  });
});