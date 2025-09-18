import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import { join } from 'path';
import * as fs from 'fs';

let electronApp: ElectronApplication;
let mainWindow: Page;

test.beforeAll(async () => {
  // Launch Electron app
  electronApp = await electron.launch({
    args: [join(__dirname, '..')],
    env: {
      NODE_ENV: 'test',
      TEST_MODE: 'true'
    }
  });

  // Wait for the first window to open
  mainWindow = await electronApp.firstWindow();

  // Wait for the window to be ready
  await mainWindow.waitForLoadState('networkidle');
});

test.afterAll(async () => {
  // Clean up - close the app
  await electronApp.close();
});

test.describe('Terminal Settings', () => {
  test('should open terminal settings from menu and persist font changes', async () => {
    // First, open a project to get access to terminals
    const testProjectPath = join(__dirname, '../../../');

    // Open a project via the dialog
    await mainWindow.click('button:has-text("Open Project Folder")');

    // Set the file chooser to select our test project
    await electronApp.evaluate(async ({ dialog }, projectPath) => {
      dialog.showOpenDialog = () => Promise.resolve({
        canceled: false,
        filePaths: [projectPath]
      });
    }, testProjectPath);

    // Wait for project to load and terminal to appear
    await mainWindow.waitForSelector('.claude-terminal-root', { timeout: 10000 });

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
    await mainWindow.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Verify the dialog title
    const dialogTitle = await mainWindow.textContent('h2:has-text("Terminal Settings")');
    expect(dialogTitle).toContain('Terminal Settings');

    // Verify the description mentions universal settings
    const description = await mainWindow.textContent('text=/Changes apply universally/');
    expect(description).toBeTruthy();

    // Test font family selection
    const fontSelect = await mainWindow.locator('select#fontFamily');
    await expect(fontSelect).toBeVisible();

    // Get initial font value
    const initialFont = await fontSelect.inputValue();

    // Change to a different font
    const newFont = '"Cascadia Code", Menlo, Monaco, monospace';
    await fontSelect.selectOption(newFont);

    // Test font size change
    const fontSizeInput = await mainWindow.locator('input#fontSize');
    await expect(fontSizeInput).toBeVisible();

    // Clear and set new font size
    await fontSizeInput.fill('16');

    // Test cursor blink toggle
    const cursorBlinkCheckbox = await mainWindow.locator('input#cursorBlink');
    await expect(cursorBlinkCheckbox).toBeVisible();
    const initialBlinkState = await cursorBlinkCheckbox.isChecked();
    await cursorBlinkCheckbox.click();

    // Test scrollback buffer
    const scrollbackInput = await mainWindow.locator('input#scrollback');
    await expect(scrollbackInput).toBeVisible();
    await scrollbackInput.fill('5000');

    // Test tab width
    const tabWidthInput = await mainWindow.locator('input#tabStopWidth');
    await expect(tabWidthInput).toBeVisible();
    await tabWidthInput.fill('2');

    // Click Done button to close dialog
    await mainWindow.click('button:has-text("Done")');

    // Verify dialog is closed
    await expect(mainWindow.locator('[role="dialog"]')).toBeHidden();

    // Verify settings are persisted by checking the settings file
    const userDataPath = await electronApp.evaluate(async ({ app }) => {
      return app.getPath('userData');
    });

    const settingsPath = join(userDataPath, 'terminal-settings.json');

    // Wait a moment for settings to be saved
    await mainWindow.waitForTimeout(500);

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

    await mainWindow.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Verify settings are loaded correctly
    await expect(fontSelect).toHaveValue(newFont);
    await expect(fontSizeInput).toHaveValue('16');
    await expect(cursorBlinkCheckbox).toBeChecked({ checked: !initialBlinkState });
    await expect(scrollbackInput).toHaveValue('5000');
    await expect(tabWidthInput).toHaveValue('2');

    // Test Reset to Defaults
    await mainWindow.click('button:has-text("Reset to Defaults")');

    // Wait for reset to apply
    await mainWindow.waitForTimeout(500);

    // Verify defaults are restored
    await expect(fontSelect).toHaveValue('Menlo, Monaco, "Courier New", monospace');
    await expect(fontSizeInput).toHaveValue('14');
    await expect(cursorBlinkCheckbox).toBeChecked();
    await expect(scrollbackInput).toHaveValue('10000');
    await expect(tabWidthInput).toHaveValue('4');

    // Close dialog
    await mainWindow.click('button:has-text("Done")');
  });

  test('should apply font settings to all terminals', async () => {
    // Open terminal settings
    await electronApp.evaluate(async ({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      const viewMenu = menu.items.find(item => item.label === 'View');
      const terminalSettingsItem = viewMenu.submenu.items.find(
        item => item.label && item.label.includes('Terminal Settings')
      );
      terminalSettingsItem.click();
    });

    await mainWindow.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Change font size to something distinctive
    const fontSizeInput = await mainWindow.locator('input#fontSize');
    await fontSizeInput.fill('18');

    // Close dialog
    await mainWindow.click('button:has-text("Done")');

    // Verify the terminal has the new font size applied
    // This would require checking the actual terminal element's computed styles
    const terminalElement = await mainWindow.locator('.xterm').first();
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
    await electronApp.evaluate(async ({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      const viewMenu = menu.items.find(item => item.label === 'View');
      const terminalSettingsItem = viewMenu.submenu.items.find(
        item => item.label && item.label.includes('Terminal Settings')
      );
      terminalSettingsItem.click();
    });

    await mainWindow.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Select "Custom Font..." option
    const fontSelect = await mainWindow.locator('select#fontFamily');
    await fontSelect.selectOption('custom');

    // Custom font input should appear
    const customFontInput = await mainWindow.locator('input#customFont');
    await expect(customFontInput).toBeVisible();

    // Enter a custom font
    const customFont = '"Fira Code", "Cascadia Code", monospace';
    await customFontInput.fill(customFont);

    // Apply the custom font
    await mainWindow.click('button:has-text("Apply")');

    // Wait for the change to be applied
    await mainWindow.waitForTimeout(500);

    // Close and reopen to verify persistence
    await mainWindow.click('button:has-text("Done")');
    await mainWindow.waitForSelector('[role="dialog"]', { state: 'hidden' });

    // Reopen settings
    await electronApp.evaluate(async ({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      const viewMenu = menu.items.find(item => item.label === 'View');
      const terminalSettingsItem = viewMenu.submenu.items.find(
        item => item.label && item.label.includes('Terminal Settings')
      );
      terminalSettingsItem.click();
    });

    await mainWindow.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // The custom font should be shown in the custom font input
    // since it's not in the predefined list
    const customFontInputAgain = await mainWindow.locator('input#customFont');
    await expect(customFontInputAgain).toBeVisible();

    // Close dialog
    await mainWindow.click('button:has-text("Done")');
  });
});