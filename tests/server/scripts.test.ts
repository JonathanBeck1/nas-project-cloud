import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "@/lib/server/db";

const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function runScript(script: string, dir: string) {
  return spawnSync("npm", ["run", "--silent", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      NAS_CLOUD_STORAGE_ROOT: path.join(dir, "storage"),
      NAS_CLOUD_DB_PATH: path.join(dir, "test.sqlite")
    }
  });
}

describe("maintenance scripts", () => {
  it("index:storage runs and indexes the storage root", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-script-"));
    createdDirs.push(dir);
    fs.mkdirSync(path.join(dir, "storage", "Inbox", "Mac"), { recursive: true });
    fs.writeFileSync(path.join(dir, "storage", "Inbox", "Mac", "fixture.stl"), "solid");

    const result = runScript("index:storage", dir);

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      expect(db.prepare("select count(*) as count from files").get()).toEqual({ count: 1 });
    } finally {
      db.close();
    }
  }, 30_000);

  it("previews:generate runs against an empty queue", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-script-"));
    createdDirs.push(dir);
    fs.mkdirSync(path.join(dir, "storage"), { recursive: true });

    const result = runScript("previews:generate", dir);

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toBeTypeOf("object");
  }, 30_000);
});
