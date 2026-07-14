import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('CI Smoke Tests', () => {
  test('verify build output exists', async () => {
    // Check that the built files exist
    const mainPath = path.join(__dirname, '../dist/main/index.js');
    const rendererPath = path.join(__dirname, '../dist/renderer/index.html');

    expect(fs.existsSync(mainPath)).toBe(true);
    expect(fs.existsSync(rendererPath)).toBe(true);

    // Verify renderer HTML contains expected app structure
    const rendererHtml = fs.readFileSync(rendererPath, 'utf-8');
    expect(rendererHtml).toContain('<div id="root">');
    expect(rendererHtml).toMatch(/\.js/); // Has JavaScript file reference
  });

  test('verify test main file compiles', async () => {
    const testMainPath = path.join(__dirname, '../dist/main/test-index.js');
    expect(fs.existsSync(testMainPath)).toBe(true);

    // Verify it contains expected exports
    const testMainContent = fs.readFileSync(testMainPath, 'utf-8');
    expect(testMainContent).toContain('BrowserWindow');
    expect(testMainContent).toContain('loadFile');
  });
});
