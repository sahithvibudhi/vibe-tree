# Electron MCP Debugging Guide - Project Opening Features

This guide documents how to open projects in the VibeTree Electron application using the Electron MCP tools.

## Prerequisites

1. Electron MCP server must be installed and running
2. The Electron app must be started with remote debugging enabled

## Enabling Remote Debugging

Run the application with debugging enabled:

```bash
cd apps/desktop
pnpm dev:debug
```

This command starts Electron with `--remote-debugging-port=9222`.

## Starting the Application

```bash
cd apps/desktop
pnpm dev
```

Wait for the app to fully start (approximately 8 seconds).

## Understanding the IPC Bridge

The app uses `window.electronAPI` to communicate between renderer and main process:

```javascript
window.electronAPI = {
  git: { ... },        // Git operations
  shell: { ... },      // Terminal operations
  ide: { ... },        // IDE integrations
  theme: { ... },      // Theme management
  dialog: { ... },     // Native dialogs
  recentProjects: { ... },  // Project management
  project: { ... }     // Project operations
}
```

## Methods to Open Projects

### Method 1: Open Current Working Directory

The `openCwd` method allows you to quickly open the current working directory (where the Electron app was launched from) in VibeTree.

#### Quick Usage

```javascript
// One-liner to open current directory
mcp__electron__send_command_to_electron({
  command: 'eval',
  args: { code: 'window.electronAPI.project.openCwd()' }
});
```

#### Use Cases

1. **During Development**: Open the project directory you're currently working in
2. **Testing**: Quickly load a test project without navigating through dialogs
3. **CI/CD**: Programmatically open projects in automated testing scenarios
4. **Debugging**: Verify the app can handle the current directory structure

#### Complete Example with Error Handling

```javascript
mcp__electron__send_command_to_electron({
  command: 'eval',
  args: {
    code: `
      window.electronAPI.project.openCwd()
        .then(result => {
          if (result.success) {
            console.log('Successfully opened:', result.path);
            return { status: 'success', path: result.path };
          } else {
            console.error('Failed to open CWD:', result.error);
            return { status: 'error', message: result.error };
          }
        })
        .catch(err => {
          console.error('Error calling openCwd:', err);
          return { status: 'error', message: err.toString() };
        })
    `
  }
});
```

#### Implementation Details

The `openCwd` method:

- Gets the current working directory using `process.cwd()` in the main process
- Verifies the directory exists
- Sends an IPC message to open the project
- Returns success status and the opened path

This is exposed through:

1. **Main Process**: `ipcMain.handle('project:open-cwd')` in `src/main/index.ts:254-261`
2. **Preload Script**: `window.electronAPI.project.openCwd()` in `src/preload/index.ts:60`
3. **Renderer**: Receives `project:open` event to update UI

### Method 2: Open Specific Path

```javascript
// Using Electron API directly
window.electronAPI.project.openPath('/path/to/project');

// Using Electron MCP
mcp__electron__send_command_to_electron({
  command: 'eval',
  args: {
    code: `
      window.electronAPI.project.openPath('/path/to/project').then(result => {
        console.log('Opened path:', result);
        return result;
      })
    `
  }
});
```

### Method 3: Using Recent Projects API

```javascript
// Add to recent projects
window.electronAPI.recentProjects.add('/path/to/project');

// Get recent projects
window.electronAPI.recentProjects.get();
```

### Method 4: Using Dialog API

```javascript
// Open native folder selector
window.electronAPI.dialog.selectDirectory();
```

## Example: Complete Project Open Flow

```javascript
// 1. Check app state
await mcp__electron__get_electron_window_info({ includeChildren: true });

// 2. Take screenshot to see current state
await mcp__electron__take_screenshot({ outputPath: '/tmp/current.png' });

// 3. Open current working directory
await mcp__electron__send_command_to_electron({
  command: 'eval',
  args: {
    code: `window.electronAPI.project.openCwd()`
  }
});

// 4. Wait for project to load
await new Promise((resolve) => setTimeout(resolve, 2000));

// 5. Verify project opened
await mcp__electron__take_screenshot({ outputPath: '/tmp/after.png' });
```

## Common Issues and Solutions

### Issue: Native File Dialog Cannot Be Controlled

**Problem**: Electron MCP cannot interact with native OS dialogs.
**Solution**: Use the IPC bridge or programmatic methods to set project paths directly.

### Issue: React State Not Accessible

**Problem**: React component state is encapsulated and not directly accessible.
**Solution**:

1. Use React DevTools hook: `window.__REACT_DEVTOOLS_GLOBAL_HOOK__`
2. Use the IPC bridge to communicate with the main process

## Tips for Effective Debugging

1. **Always wait for app to fully load** before sending commands
2. **Use screenshots** to verify UI state
3. **Check console logs** for errors or debug messages
4. **Use eval command** for custom JavaScript execution
5. **Combine multiple MCP commands** for complex interactions
6. **Monitor background processes** using BashOutput tool

## References

- [Electron Remote Debugging](https://www.electronjs.org/docs/latest/tutorial/debugging-main-process)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [React DevTools](https://react.dev/learn/react-developer-tools)
