import { defineConfig, devices } from "@playwright/test";

const e2ePort = 3100;
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: e2eBaseUrl,
    trace: "on-first-retry"
  },
  webServer: {
    command: "node scripts/prepare-e2e-data.mjs && npm run dev",
    url: e2eBaseUrl,
    reuseExistingServer: false,
    env: {
      NAS_CLOUD_DB_PATH: ".data/e2e/nas-cloud.sqlite",
      NAS_CLOUD_STORAGE_ROOT: ".data/e2e/storage",
      PORT: String(e2ePort)
    },
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
