import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type AppDatabase } from "@/lib/server/db";
import type { AppConfig } from "@/lib/server/config";

describe("health checks", () => {
  let tempRoot: string;
  let db: AppDatabase;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-health-"));
  });

  afterEach(() => {
    if (db?.open) {
      db.close();
    }
    fs.rmSync(tempRoot, { force: true, recursive: true });
  });

  it("reports healthy when storage is writable and the database responds", async () => {
    const config = testConfig(tempRoot);
    fs.mkdirSync(config.storageRoot, { recursive: true });
    db = createDatabase(config.dbPath);
    const { checkHealth } = await import("@/lib/server/health");

    const result = await checkHealth({
      config,
      db,
      probes: {
        ffmpeg: async () => ({ available: true, version: "6.1" }),
        poppler: async () => ({ available: true, version: "24.0" })
      }
    });

    expect(result.ok).toBe(true);
    expect(result.checks.storage.ok).toBe(true);
    expect(result.checks.storage.path).toBe(config.storageRoot);
    expect(result.checks.database.ok).toBe(true);
    expect(result.checks.database.path).toBe(config.dbPath);
  });

  it("includes preview tool readiness for TrueNAS deployment diagnostics", async () => {
    const config = testConfig(tempRoot);
    fs.mkdirSync(config.storageRoot, { recursive: true });
    db = createDatabase(config.dbPath);
    const { checkHealth } = await import("@/lib/server/health");

    const result = await checkHealth({
      config,
      db,
      probes: {
        ffmpeg: async () => ({ available: true, version: "6.1" }),
        poppler: async () => ({ available: false, error: "spawn pdftoppm ENOENT" })
      }
    });

    expect(result.ok).toBe(false);
    expect(result.checks.previewTools.ffmpeg).toEqual({ ok: true, name: "ffmpeg", version: "6.1" });
    expect(result.checks.previewTools.poppler).toEqual({
      ok: false,
      name: "pdftoppm",
      error: "spawn pdftoppm ENOENT"
    });
  });

  it("reports unhealthy when the storage mount cannot be written", async () => {
    const config = testConfig(tempRoot);
    fs.mkdirSync(path.dirname(config.storageRoot), { recursive: true });
    fs.writeFileSync(config.storageRoot, "not a directory");
    db = createDatabase(config.dbPath);
    const { checkHealth } = await import("@/lib/server/health");

    const result = await checkHealth({ config, db });

    expect(result.ok).toBe(false);
    expect(result.checks.storage.ok).toBe(false);
    expect(result.checks.storage.error).toContain("ENOTDIR");
    expect(result.checks.database.ok).toBe(true);
  });
});

function testConfig(tempRoot: string): AppConfig {
  return {
    storageRoot: path.join(tempRoot, "files"),
    dbPath: path.join(tempRoot, "appdata", "nas-cloud.sqlite"),
    publicBasePath: "/files",
    maxUploadBytes: 2_147_483_648,
    previewScheduler: "off",
    secureCookies: false
  };
}
