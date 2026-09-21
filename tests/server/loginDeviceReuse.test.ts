import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AppDatabase, createDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("@/lib/server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/db")>()),
  getDatabase: () => state.db
}));
vi.mock("@/lib/server/auth/passwords", () => ({
  verifyPassword: vi.fn(async () => true),
  hashPassword: vi.fn(),
  needsRehash: () => false,
  DUMMY_PASSWORD_HASH: "scrypt:dummy"
}));

let dir: string;
let db: AppDatabase;
let userId: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-device-reuse-"));
  db = createDatabase(path.join(dir, "test.sqlite"));
  state.db = db;
  userId = createMetadataRepository(db).createUser({
    email: "owner@example.test",
    name: "Owner",
    passwordHash: "x",
    role: "owner"
  }).id;
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function login(deviceName: string) {
  const { POST } = await import("@/app/api/auth/login/route");
  const response = await POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "owner@example.test", password: "long-enough-password", deviceName })
    })
  );
  expect(response.status).toBe(200);
}

const count = (table: string) => (db.prepare(`select count(*) as count from ${table}`).get() as { count: number }).count;

describe("devices created by login", () => {
  it("reuses the browser device with the same name instead of adding one per login", async () => {
    await login("Mac Studio");
    await login("Mac Studio");
    await login("Mac Studio");

    expect(count("devices")).toBe(1);
    expect(count("sessions")).toBe(3);
    expect(createMetadataRepository(db).listDevices(userId)[0].lastSeenAt).toEqual(expect.any(String));
  });

  it("keeps differently named devices apart", async () => {
    await login("Mac Studio");
    await login("Windows PC");

    expect(count("devices")).toBe(2);
  });

  it("starts a fresh device after the old one was revoked", async () => {
    const repo = createMetadataRepository(db);
    await login("Mac Studio");
    const [first] = repo.listDevices(userId);
    repo.revokeDevice(userId, first.id);

    await login("Mac Studio");

    const [second] = repo.listDevices(userId);
    expect(count("devices")).toBe(1);
    expect(second.id).not.toBe(first.id);
  });

  it("does not take over a paired device that happens to share the name", async () => {
    const repo = createMetadataRepository(db);
    const paired = repo.createDevice({ userId, name: "Mac Studio", kind: "desktop" });

    await login("Mac Studio");

    expect(count("devices")).toBe(2);
    expect(db.prepare("select count(*) as count from sessions where device_id = ?").get(paired.id)).toEqual({ count: 0 });
  });
});
