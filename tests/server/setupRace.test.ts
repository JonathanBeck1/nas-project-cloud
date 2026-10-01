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
  hashPassword: vi.fn(async (password: string) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return `scrypt:test:${password}`;
  })
}));

let dir: string;
let db: AppDatabase;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-setup-"));
  db = createDatabase(path.join(dir, "test.sqlite"));
  state.db = db;
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function setupRequest(email: string, setupCode?: string) {
  return new Request("http://localhost/api/auth/setup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, name: "Owner", password: "long-enough-password", setupCode })
  });
}

function count(table: string) {
  return (db.prepare(`select count(*) as count from ${table}`).get() as { count: number }).count;
}

describe("owner setup", () => {
  it("lets only one of two simultaneous setups become the owner", async () => {
    const { POST } = await import("@/app/api/auth/setup/route");

    const code = createMetadataRepository(db).getOrCreateSetupCode();

    const responses = await Promise.all([
      POST(setupRequest("first@example.test", code)),
      POST(setupRequest("second@example.test", code))
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(db.prepare("select count(*) as count from users").get()).toEqual({ count: 1 });
    expect(db.prepare("select count(*) as count from sessions").get()).toEqual({ count: 1 });
  });

  it("refuses setup without the setup code", async () => {
    const { POST } = await import("@/app/api/auth/setup/route");
    createMetadataRepository(db).getOrCreateSetupCode();

    const response = await POST(setupRequest("owner@example.test"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "setup code is wrong" });
    expect(count("users")).toBe(0);
  });

  it("refuses a wrong setup code", async () => {
    const { POST } = await import("@/app/api/auth/setup/route");
    createMetadataRepository(db).getOrCreateSetupCode();

    const response = await POST(setupRequest("owner@example.test", "ABCD-EFGH-JKMN"));

    expect(response.status).toBe(403);
    expect(count("users")).toBe(0);
  });

  it("refuses setup when no code was ever printed", async () => {
    const { POST } = await import("@/app/api/auth/setup/route");

    const response = await POST(setupRequest("owner@example.test", ""));

    expect(response.status).toBe(403);
    expect(count("users")).toBe(0);
  });

  it("accepts the code typed in lowercase with dashes and spaces", async () => {
    const { POST } = await import("@/app/api/auth/setup/route");
    const code = createMetadataRepository(db).getOrCreateSetupCode();
    const typed = ` ${code.slice(0, 4)}-${code.slice(4, 8)} ${code.slice(8)} `.toLowerCase();

    const response = await POST(setupRequest("owner@example.test", typed));

    expect(response.status).toBe(201);
    expect(count("users")).toBe(1);
  });

  it("uses the code up once the owner exists", async () => {
    const { POST } = await import("@/app/api/auth/setup/route");
    const code = createMetadataRepository(db).getOrCreateSetupCode();

    expect((await POST(setupRequest("owner@example.test", code))).status).toBe(201);

    expect(count("setup_codes")).toBe(0);
    expect((await POST(setupRequest("second@example.test", code))).status).toBe(409);
  });
});

describe("setup code", () => {
  it("keeps the same code until it is used, so an older log line still works", () => {
    const repo = createMetadataRepository(db);

    const first = repo.getOrCreateSetupCode();

    expect(repo.getOrCreateSetupCode()).toBe(first);
    expect(count("setup_codes")).toBe(1);
  });

  it("is 12 characters with no 0, O, 1, I or L to misread", () => {
    const codes = Array.from({ length: 50 }, () => {
      db.exec("delete from setup_codes");
      return createMetadataRepository(db).getOrCreateSetupCode();
    });

    for (const code of codes) {
      expect(code).toMatch(/^[2-9A-HJKMNP-Z]{12}$/);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });
});
