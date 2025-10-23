const { contextBridge, ipcRenderer } = require('electron');

console.log('[PRELOAD] Stats dialog preload script loaded');

// Expose close function to renderer
contextBridge.exposeInMainWorld('statsDialog', {
  close: () => {
    console.log('[PRELOAD] statsDialog.close() called, sending IPC event');
    ipcRenderer.send('stats-dialog:close');
    console.log('[PRELOAD] IPC event sent');
  },
  getStats: () => {
    console.log('[PRELOAD] statsDialog.getStats() called');
    return ipcRenderer.invoke('shell:get-stats');
  }
});

console.log('[PRELOAD] statsDialog API exposed to window');
