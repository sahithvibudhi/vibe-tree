import { ipcRenderer } from 'electron';

// Since contextIsolation is false, we can directly assign to window
(window as any).statsDialog = {
  getStats: async () => {
    const stats = await ipcRenderer.invoke('shell:get-stats');
    return stats;
  },
  closeWindow: () => {
    ipcRenderer.send('stats-dialog:close');
  }
};
