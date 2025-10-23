import { contextBridge, ipcRenderer } from 'electron';

console.log('[Preload] Stats dialog preload script starting');

contextBridge.exposeInMainWorld('statsDialog', {
  getStats: async () => {
    console.log('[Preload] getStats called');
    const stats = await ipcRenderer.invoke('shell:get-stats');
    console.log('[Preload] Received stats:', stats);
    return stats;
  },
  closeWindow: () => {
    console.log('[Preload] closeWindow called');
    ipcRenderer.send('stats-dialog:close');
  }
});

console.log('[Preload] Stats dialog preload script loaded');
