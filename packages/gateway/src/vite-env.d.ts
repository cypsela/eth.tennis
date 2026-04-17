/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GATEWAY_DOMAIN?: string;
  readonly VITE_RPC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
