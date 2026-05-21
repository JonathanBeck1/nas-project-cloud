import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appConfig, getAppConfig, resetAppConfigForTesting, resolveAppConfig } from "@/lib/server/config";

describe("resolveAppConfig", () => {
  it("uses safe local defaults", () => {
    const config = resolveAppConfig({});
    expect(config.storageRoot.endsWith(".data/storage")).toBe(true);
    expect(config.dbPath.endsWith(".data/nas-cloud.sqlite")).toBe(true);
    expect(config.maxUploadBytes).toBe(2_147_483_648);
  });

  it("honors explicit environment values", () => {
    const config = resolveAppConfig({
      NAS_CLOUD_STORAGE_ROOT: "/mnt/nas-cloud",
      NAS_CLOUD_DB_PATH: "/data/cloud.sqlite",
      NAS_CLOUD_MAX_UPLOAD_BYTES: "1024"
    });

    expect(config.storageRoot).toBe("/mnt/nas-cloud");
    expect(config.dbPath).toBe("/data/cloud.sqlite");
    expect(config.maxUploadBytes).toBe(1024);
  });
});

describe("appConfig lazy validation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetAppConfigForTesting();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetAppConfigForTesting();
  });

  it("reads process.env on first property access via the proxy, not at module import", () => {
    process.env.NAS_CLOUD_PUBLIC_BASE_PATH = "/lazy-files";

    expect(appConfig.publicBasePath).toBe("/lazy-files");
  });

  it("memoizes the resolved config across getAppConfig() calls", () => {
    process.env.NAS_CLOUD_PUBLIC_BASE_PATH = "/cached";

    const first = getAppConfig();
    process.env.NAS_CLOUD_PUBLIC_BASE_PATH = "/changed-after";
    const second = getAppConfig();

    expect(first).toBe(second);
    expect(second.publicBasePath).toBe("/cached");
  });
});
