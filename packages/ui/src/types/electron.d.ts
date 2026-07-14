interface ElectronAPI {
  shell?: {
    openExternal?: (url: string) => Promise<void>;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
