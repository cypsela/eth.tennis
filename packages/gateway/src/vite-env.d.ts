/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GATEWAY_DOMAIN?: string;
  readonly VITE_RPC_URLS?: string;
  readonly VITE_TEST_CONTENT_GATEWAY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
