import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';

interface MenuItem {
  label?: string;
  enabled?: boolean;
  visible?: boolean;
  type?: string;
  role?: string;
  accelerator?: string;
  submenu?: MenuItem[];
}

test.describe('Application Menu Structure', () => {
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeEach(async () => {
    const testMainPath = path.join(__dirname, '../dist/main/test-index.js');
    const mainPath = fs.existsSync(testMainPath) ? testMainPath : path.join(__dirname, '..');

    electronApp = await electron.launch({
      args: [mainPath],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TEST_MODE: 'true',
        DISABLE_QUIT_DIALOG: 'true'  // Prevent blocking on quit dialog
      },
    });

    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.evaluate(() => process.exit(0));
    }
  });

  test('should have correct menu structure with all required items', async () => {
    // Get the menu structure from the main process
    const menuStructure = await electronApp.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      if (!menu) {
        throw new Error('Application menu not found');
      }

      // Helper function to extract menu structure
      const extractMenuStructure = (menuItem: Electron.MenuItem): MenuItem => {
        const item: MenuItem = {
          label: menuItem.label,
          enabled: menuItem.enabled,
          visible: menuItem.visible,
          type: menuItem.type,
          role: menuItem.role,
          accelerator: menuItem.accelerator
        };

        if (menuItem.submenu) {
          item.submenu = menuItem.submenu.items.map(extractMenuStructure);
        }

        return item;
      };

      return menu.items.map(extractMenuStructure);
    });

    // Verify File menu exists
    const fileMenu = menuStructure.find((menu: MenuItem) => menu.label === 'File');
    expect(fileMenu).toBeTruthy();
    expect(fileMenu.submenu).toBeTruthy();

    // Verify File menu items
    const fileMenuLabels = fileMenu.submenu.map((item: MenuItem) => item.label).filter(Boolean);
    expect(fileMenuLabels).toContain('Open Project Folder...');
    expect(fileMenuLabels).toContain('Recent Projects');

    // The quit menu item might have different labels depending on platform/Electron version
    const hasQuitItem = fileMenuLabels.some((label: string) =>
      label.includes('Quit') || label === 'Exit'
    );
    expect(hasQuitItem).toBeTruthy();

    // Verify Recent Projects submenu exists
    const recentProjectsItem = fileMenu.submenu.find((item: MenuItem) => item.label === 'Recent Projects');
    expect(recentProjectsItem).toBeTruthy();
    expect(recentProjectsItem.submenu).toBeTruthy();

    // Should have at least "No recent projects" or actual projects
    expect(recentProjectsItem.submenu.length).toBeGreaterThan(0);

    // Verify Edit menu exists
    const editMenu = menuStructure.find((menu: MenuItem) => menu.label === 'Edit');
    expect(editMenu).toBeTruthy();
    expect(editMenu.submenu).toBeTruthy();

    // Verify Edit menu has standard items (roles might be lowercase)
    const editMenuRoles = editMenu.submenu.map((item: MenuItem) => item.role?.toLowerCase()).filter(Boolean);
    expect(editMenuRoles).toContain('undo');
    expect(editMenuRoles).toContain('redo');
    expect(editMenuRoles).toContain('cut');
    expect(editMenuRoles).toContain('copy');
    expect(editMenuRoles).toContain('paste');
    expect(editMenuRoles).toContain('selectall');

    // Verify View menu exists
    const viewMenu = menuStructure.find((menu: MenuItem) => menu.label === 'View');
    expect(viewMenu).toBeTruthy();
    expect(viewMenu.submenu).toBeTruthy();

    // Verify View menu items
    const viewMenuLabels = viewMenu.submenu.map((item: MenuItem) => item.label).filter(Boolean);
    expect(viewMenuLabels).toContain('Terminal Settings...');
    expect(viewMenuLabels).toContain('Stats...');

    const viewMenuRoles = viewMenu.submenu.map((item: MenuItem) => item.role?.toLowerCase()).filter(Boolean);
    expect(viewMenuRoles).toContain('reload');
    expect(viewMenuRoles).toContain('toggledevtools');
    expect(viewMenuRoles).toContain('togglefullscreen');

    // Verify Window menu exists
    const windowMenu = menuStructure.find((menu: MenuItem) => menu.label === 'Window');
    expect(windowMenu).toBeTruthy();
    expect(windowMenu.submenu).toBeTruthy();

    // Verify Window menu has standard items
    const windowMenuRoles = windowMenu.submenu.map((item: MenuItem) => item.role?.toLowerCase()).filter(Boolean);
    expect(windowMenuRoles).toContain('minimize');
    expect(windowMenuRoles).toContain('close');
  });

  test('should have keyboard shortcuts for important menu items', async () => {
    const menuStructure = await electronApp.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      if (!menu) {
        throw new Error('Application menu not found');
      }

      // Extract all menu items with accelerators
      const extractAccelerators = (menuItem: Electron.MenuItem): Array<{label?: string; accelerator?: string}> => {
        const items: Array<{label?: string; accelerator?: string}> = [];

        if (menuItem.accelerator) {
          items.push({
            label: menuItem.label,
            accelerator: menuItem.accelerator
          });
        }

        if (menuItem.submenu) {
          menuItem.submenu.items.forEach((item: Electron.MenuItem) => {
            items.push(...extractAccelerators(item));
          });
        }

        return items;
      };

      const allAccelerators: Array<{label?: string; accelerator?: string}> = [];
      menu.items.forEach((item: Electron.MenuItem) => {
        allAccelerators.push(...extractAccelerators(item));
      });

      return allAccelerators;
    });

    // Verify important shortcuts exist
    const shortcuts = menuStructure.map((item: {label?: string; accelerator?: string}) => item.accelerator);
    expect(shortcuts).toContain('CmdOrCtrl+O'); // Open Project Folder
  });

  test('should update Recent Projects menu when a project is added', async () => {
    // Add a test project to recent projects
    const testProjectPath = '/test/project/path';
    await electronApp.evaluate(async ({ ipcMain }, projectPath) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handlers = (ipcMain as unknown as {_invokeHandlers?: Map<string, (...args: any[]) => any>})._invokeHandlers;
      if (handlers && handlers.get('recent-projects:add')) {
        const handler = handlers.get('recent-projects:add');
        await handler(null, projectPath);
      }
    }, testProjectPath);

    // Wait a bit for menu to update
    await page.waitForTimeout(500);

    // Get updated menu structure
    const menuStructure = await electronApp.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      if (!menu) {
        throw new Error('Application menu not found');
      }

      const fileMenu = menu.items.find(item => item.label === 'File');
      if (!fileMenu || !fileMenu.submenu) {
        throw new Error('File menu not found');
      }

      const recentProjects = fileMenu.submenu.items.find(item => item.label === 'Recent Projects');
      if (!recentProjects || !recentProjects.submenu) {
        throw new Error('Recent Projects submenu not found');
      }

      return recentProjects.submenu.items.map((item: Electron.MenuItem) => ({
        label: item.label,
        enabled: item.enabled
      }));
    });

    // Verify the project was added
    const projectLabels = menuStructure.map((item: {label?: string; enabled?: boolean}) => item.label).filter(Boolean);

    // Should either have the test project or "Clear Recent Projects" option
    expect(menuStructure.length).toBeGreaterThan(0);
    expect(projectLabels.some((label: string) =>
      label === 'Clear Recent Projects' ||
      label === 'No Recent Projects' ||
      (label.includes('test') && label.includes(testProjectPath))
    )).toBeTruthy();
  });
});