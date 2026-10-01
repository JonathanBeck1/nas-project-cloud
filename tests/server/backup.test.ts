import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backupDatabase } from "@/lib/server/backup";
import { type AppDatabase, createDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

const NOW = new Date("2026-10-02T03:04:05Z");

let dir: string;
let dbPath: string;
let backups: string;
let db: AppDatabase;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-backup-"));
  dbPath = path.join(dir, "nas-cloud.sqlite");
  backups = path.join(dir, "backups");
  db = createDatabase(dbPath);
  const repo = createMetadataRepository(db);
  repo.createUser({ email: "owner@example.test", name: "Owner", passwordHash: "x", role: "owner" });
  repo.createTag({ name: "print-ready" });
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function plant(name: string, modified = NOW) {
  fs.mkdirSync(backups, { recursive: true });
  const file = path.join(backups, name);
  fs.writeFileSync(file, "x");
  fs.utimesSync(file, modified, modified);
  return file;
}

describe("daily metadata backup", () => {
  it("writes a dated copy next to the database that opens with the same rows", async () => {
    const result = await backupDatabase({ db, dbPath, now: NOW });

    const copy = path.join(backups, "nas-cloud-2026-10-02.sqlite");
    expect(result).toEqual({ created: copy, removed: 0 });
    const restored = new Database(copy, { readonly: true });
    try {
      expect(restored.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(restored.prepare("select email from users").all()).toEqual([{ email: "owner@example.test" }]);
      expect(restored.prepare("select name from tags").all()).toEqual([{ name: "print-ready" }]);
    } finally {
      restored.close();
    }
  });

  it("takes one backup a day however often maintenance runs", async () => {
    await backupDatabase({ db, dbPath, now: NOW });
    createMetadataRepository(db).createTag({ name: "later-today" });

    const again = await backupDatabase({ db, dbPath, now: new Date("2026-10-02T23:59:00Z") });

    expect(again).toEqual({ created: null, removed: 0 });
    expect(fs.readdirSync(backups)).toEqual(["nas-cloud-2026-10-02.sqlite"]);
  });

  it("keeps the newest seven and leaves other files alone", async () => {
    for (let day = 21; day <= 30; day++) {
      plant(`nas-cloud-2026-09-${day}.sqlite`);
    }
    const unrelated = plant("before-upgrade-0.4.0.sqlite");

    const result = await backupDatabase({ db, dbPath, now: NOW });

    expect(result.removed).toBe(4);
    expect(fs.readdirSync(backups).filter((name) => name.startsWith("nas-cloud-")).sort()).toEqual([
      "nas-cloud-2026-09-25.sqlite",
      "nas-cloud-2026-09-26.sqlite",
      "nas-cloud-2026-09-27.sqlite",
      "nas-cloud-2026-09-28.sqlite",
      "nas-cloud-2026-09-29.sqlite",
      "nas-cloud-2026-09-30.sqlite",
      "nas-cloud-2026-10-02.sqlite"
    ]);
    expect(fs.existsSync(unrelated)).toBe(true);
  });

  it("clears a half-written copy an interrupted backup left, but not one still being written", async () => {
    const interrupted = plant("nas-cloud-2026-10-01.sqlite.a1b2c3.tmp", new Date(NOW.getTime() - 2 * 60 * 60 * 1000));
    const writing = plant("nas-cloud-2026-10-02.sqlite.d4e5f6.tmp", NOW);

    await backupDatabase({ db, dbPath, now: NOW });

    expect(fs.existsSync(interrupted)).toBe(false);
    expect(fs.existsSync(writing)).toBe(true);
  });
});
