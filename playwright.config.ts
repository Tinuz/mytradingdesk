import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL: "http://127.0.0.1:3000", trace: "on-first-retry" },
  webServer: {
    command: "node tests/e2e/server.mjs",
    url: "http://127.0.0.1:3000/login",
    reuseExistingServer: !process.env.CI,
    gracefulShutdown: { signal: "SIGINT", timeout: 1_000 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
