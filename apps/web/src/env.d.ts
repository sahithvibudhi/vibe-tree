/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WS_URL: string;
  readonly VITE_PROJECT_PATH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
