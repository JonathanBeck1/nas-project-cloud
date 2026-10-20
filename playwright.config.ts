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
      name: "setup",
      testMatch: /\.setup\.ts$/,
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "chromium",
      // Written by tests/e2e/owner.setup.ts. Spelled out because the image build leaves tests/ out, so nothing here may import from it.
      use: { ...devices["Desktop Chrome"], storageState: ".data/e2e/owner-state.json" },
      dependencies: ["setup"]
    }
  ]
});
