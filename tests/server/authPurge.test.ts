import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type AppDatabase, createDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

const createdDirs: string[] = [];
const createdDbs: AppDatabase[] = [];

afterEach(() => {
  for (const db of createdDbs.splice(0)) {
    db.close();
  }
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function freshRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-purge-"));
  createdDirs.push(dir);
  const db = createDatabase(path.join(dir, "test.sqlite"));
  createdDbs.push(db);
  const repo = createMetadataRepository(db);
  const user = repo.createUser({ email: "owner@example.test", name: "Owner", passwordHash: "x", role: "owner" });
  const device = repo.createDevice({ userId: user.id, name: "Mac", kind: "desktop" });
  return { db, repo, user, device };
}

const HOUR = 60 * 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();
const count = (db: AppDatabase, table: string) =>
  (db.prepare(`select count(*) as count from ${table}`).get() as { count: number }).count;

describe("purgeExpiredAuthState", () => {
  it("removes expired sessions, dead pairing codes and old rate-limit rows, and keeps live ones", () => {
    const { db, repo, user, device } = freshRepo();
    repo.createSession({ userId: user.id, deviceId: device.id, tokenHash: "expired", expiresAt: ago(HOUR) });
    repo.createSession({ userId: user.id, deviceId: device.id, tokenHash: "live", expiresAt: ahead(HOUR) });
    const pairing = { userId: user.id, deviceName: "PC", deviceKind: "desktop" as const };
    repo.createDevicePairingCode({ ...pairing, codeHash: "live", expiresAt: ahead(HOUR) });
    const insertCode = db.prepare(`
      insert into device_pairing_codes (id, user_id, code_hash, device_name, device_kind, expires_at, consumed_at, created_at)
      values (?, ?, ?, 'PC', 'desktop', ?, ?, ?)
    `);
    insertCode.run("pair_expired", user.id, "expired", ago(HOUR), null, ago(2 * HOUR));
    insertCode.run("pair_consumed", user.id, "consumed", ahead(HOUR), ago(HOUR), ago(2 * HOUR));
    const insertEvent = db.prepare("insert into rate_limit_events (bucket, key, occurred_at) values (?, ?, ?)");
    insertEvent.run("login_email", "attacker-1@example.test", ago(25 * HOUR));
    insertEvent.run("login_email", "attacker-2@example.test", ago(30 * HOUR));
    insertEvent.run("pair_global", "global", ago(23 * HOUR));

    const purged = repo.purgeExpiredAuthState();

    expect(purged).toEqual({ sessions: 1, pairingCodes: 2, rateLimitEvents: 2 });
    expect(repo.getSessionByTokenHash("live")).not.toBeNull();
    expect(count(db, "sessions")).toBe(1);
    expect(count(db, "device_pairing_codes")).toBe(1);
    expect(count(db, "rate_limit_events")).toBe(1);
  });

  it("reuses the code of a dead pairing row instead of failing on the unique hash", () => {
    const { db, repo, user } = freshRepo();
    db.prepare(`
      insert into device_pairing_codes (id, user_id, code_hash, device_name, device_kind, expires_at, consumed_at, created_at)
      values ('pair_dead', ?, 'same-hash', 'PC', 'desktop', ?, ?, ?)
    `).run(user.id, ahead(HOUR), ago(HOUR), ago(2 * HOUR));

    const created = repo.createDevicePairingCode({
      userId: user.id,
      codeHash: "same-hash",
      deviceName: "Laptop",
      deviceKind: "mobile",
      expiresAt: ahead(HOUR)
    });

    expect(created.deviceName).toBe("Laptop");
    expect(count(db, "device_pairing_codes")).toBe(1);
  });
});
