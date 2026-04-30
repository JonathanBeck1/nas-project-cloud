import { describe, expect, it } from "vitest";
import { resolveAppConfig } from "@/lib/server/config";

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
