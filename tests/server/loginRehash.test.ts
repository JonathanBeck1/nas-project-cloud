import crypto from "node:crypto";
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

let dir: string;
let db: AppDatabase;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-rehash-"));
  db = createDatabase(path.join(dir, "test.sqlite"));
  state.db = db;
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const login = async (password: string) => {
  const { POST } = await import("@/app/api/auth/login/route");
  return POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "owner@example.test", password, deviceName: "Mac" })
    })
  );
};

const storedHash = () =>
  (db.prepare("select password_hash as hash from users").get() as { hash: string }).hash;

describe("login with a v0.3.1 password hash", () => {
  it("accepts it, upgrades it in place, and keeps accepting the same password", async () => {
    const salt = crypto.randomBytes(16).toString("hex");
    const legacy = `scrypt:${salt}:${crypto.scryptSync("a long enough password", salt, 64).toString("hex")}`;
    createMetadataRepository(db).createUser({
      email: "owner@example.test",
      name: "Owner",
      passwordHash: legacy,
      role: "owner"
    });

    expect((await login("not the password")).status).toBe(401);
    expect(storedHash()).toBe(legacy);

    expect((await login("a long enough password")).status).toBe(200);
    expect(storedHash()).toMatch(/^scrypt:131072:8:1:/);

    expect((await login("a long enough password")).status).toBe(200);
    expect((await login("not the password")).status).toBe(401);
  }, 30_000);
});
