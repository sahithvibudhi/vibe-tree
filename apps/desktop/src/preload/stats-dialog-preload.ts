import { ipcRenderer } from 'electron';

// Since contextIsolation is false, we can directly assign to window
(window as any).statsDialog = {
  getStats: async () => {
    const stats = await ipcRenderer.invoke('shell:get-stats');
    return stats;
  },
  runDiagnostics: async () => {
    const result = await ipcRenderer.invoke('shell:diagnose');
    return result;
  },
  closeWindow: () => {
    ipcRenderer.send('stats-dialog:close');
  }
};
