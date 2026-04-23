import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: true,
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://vitalik.eth.tennis.localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
  ],
  webServer: {
    command: "pnpm run dev -- --host 0.0.0.0",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env["CI"],
    timeout: 30_000,
    env: {
      VITE_RPC_URLS: "https://cloudflare-eth.com",
      VITE_TEST_CONTENT_GATEWAY: "https://test-gateway.local",
    },
  },
});
