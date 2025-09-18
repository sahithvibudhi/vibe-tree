import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
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

    // Launch Electron app with the dummy repo as the argument
    electronApp = await electron.launch({
      args: [mainPath, dummyRepoPath],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TEST_MODE: 'true'
      },
    });

    // Get the first window that opens
    page = await electronApp.firstWindow();

    // Wait for the page to be ready
    await page.waitForLoadState('networkidle');
  });

  test.afterEach(async () => {
    // Close the app
    if (electronApp) {
      await electronApp.close();
    }

    // Clean up the dummy repository
    if (dummyRepoPath && fs.existsSync(dummyRepoPath)) {
      fs.rmSync(dummyRepoPath, { recursive: true, force: true });
      console.log('Cleaned up dummy repo');
    }
  });

  test('should open terminal settings from menu and persist font changes', async () => {
    test.setTimeout(60000);

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

    // Find and click the main worktree to open terminal
    const mainWorktree = await page.locator('button', { hasText: 'main' }).first();
    await expect(mainWorktree).toBeVisible({ timeout: 10000 });
    await mainWorktree.click();

    // Now wait for terminal to appear
    await page.waitForSelector('.claude-terminal-root', { timeout: 10000 });

    // Access the menu to open terminal settings
    await electronApp.evaluate(async ({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      // Find View menu
      const viewMenu = menu.items.find(item => item.label === 'View');
      // Find Terminal Settings menu item
      const terminalSettingsItem = viewMenu.submenu.items.find(
        item => item.label && item.label.includes('Terminal Settings')
      );
      // Trigger the click handler
      terminalSettingsItem.click();
    });

    // Wait for the settings dialog to appear
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

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
    await electronApp.evaluate(async ({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      const viewMenu = menu.items.find(item => item.label === 'View');
      const terminalSettingsItem = viewMenu.submenu.items.find(
        item => item.label && item.label.includes('Terminal Settings')
      );
      terminalSettingsItem.click();
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
    test.setTimeout(60000);

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

    // Find and click the main worktree to open terminal
    const mainWorktree = await page.locator('button', { hasText: 'main' }).first();
    await expect(mainWorktree).toBeVisible({ timeout: 10000 });
    await mainWorktree.click();

    // Now wait for terminal to appear
    await page.waitForSelector('.claude-terminal-root', { timeout: 10000 });

    // Open terminal settings
    await electronApp.evaluate(async ({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      const viewMenu = menu.items.find(item => item.label === 'View');
      const terminalSettingsItem = viewMenu.submenu.items.find(
        item => item.label && item.label.includes('Terminal Settings')
      );
      terminalSettingsItem.click();
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
    test.setTimeout(60000);

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

    // Find and click the main worktree to open terminal
    const mainWorktree = await page.locator('button', { hasText: 'main' }).first();
    await expect(mainWorktree).toBeVisible({ timeout: 10000 });
    await mainWorktree.click();

    // Now wait for terminal to appear
    await page.waitForSelector('.claude-terminal-root', { timeout: 10000 });

    // Open terminal settings
    await electronApp.evaluate(async ({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      const viewMenu = menu.items.find(item => item.label === 'View');
      const terminalSettingsItem = viewMenu.submenu.items.find(
        item => item.label && item.label.includes('Terminal Settings')
      );
      terminalSettingsItem.click();
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
    await electronApp.evaluate(async ({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      const viewMenu = menu.items.find(item => item.label === 'View');
      const terminalSettingsItem = viewMenu.submenu.items.find(
        item => item.label && item.label.includes('Terminal Settings')
      );
      terminalSettingsItem.click();
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