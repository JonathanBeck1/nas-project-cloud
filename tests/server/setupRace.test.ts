import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AppDatabase, createDatabase } from "@/lib/server/db";

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

function setupRequest(email: string) {
  return new Request("http://localhost/api/auth/setup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, name: "Owner", password: "long-enough-password" })
  });
}

describe("owner setup", () => {
  it("lets only one of two simultaneous setups become the owner", async () => {
    const { POST } = await import("@/app/api/auth/setup/route");

    const responses = await Promise.all([
      POST(setupRequest("first@example.test")),
      POST(setupRequest("second@example.test"))
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(db.prepare("select count(*) as count from users").get()).toEqual({ count: 1 });
    expect(db.prepare("select count(*) as count from sessions").get()).toEqual({ count: 1 });
  });
});
