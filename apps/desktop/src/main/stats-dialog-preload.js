const { ipcRenderer } = require('electron');

console.log('[PRELOAD] Stats dialog preload script loaded');

// Expose getStats API directly on window (contextIsolation is false)
window.statsDialog = {
  getStats: () => {
    console.log('[PRELOAD] statsDialog.getStats() called');
    return ipcRenderer.invoke('shell:get-stats');
  }
};

console.log('[PRELOAD] statsDialog API exposed to window');
