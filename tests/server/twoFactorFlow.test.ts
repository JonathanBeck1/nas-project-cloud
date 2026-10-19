import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { base32Decode, totp } from "@/lib/server/auth/totp";
import { resetAppConfigForTesting } from "@/lib/server/config";
import { type AppDatabase, createDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("@/lib/server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/db")>()),
  getDatabase: () => state.db
}));

vi.mock("@/lib/server/auth/passwords", () => ({
  hashPassword: vi.fn(async (password: string) => `test:${password}`),
  verifyPassword: vi.fn(async (password: string, hash: string) => hash === `test:${password}`),
  needsRehash: vi.fn(() => false),
  DUMMY_PASSWORD_HASH: "test:"
}));

const PASSWORD = "long-enough-password";
const TOKEN = "maintenance-token-for-tests";
let dir: string;
let db: AppDatabase;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-2fa-"));
  fs.mkdirSync(path.join(dir, "storage"));
  process.env.NAS_CLOUD_STORAGE_ROOT = path.join(dir, "storage");
  process.env.NAS_CLOUD_MAINTENANCE_TOKEN = TOKEN;
  resetAppConfigForTesting();
  db = createDatabase(path.join(dir, "test.sqlite"));
  state.db = db;
});

afterEach(() => {
  db.close();
  delete process.env.NAS_CLOUD_STORAGE_ROOT;
  delete process.env.NAS_CLOUD_MAINTENANCE_TOKEN;
  resetAppConfigForTesting();
  fs.rmSync(dir, { recursive: true, force: true });
});

class Jar {
  cookies = new Map<string, string>();
  absorb(response: Response) {
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      const value = pair.slice(index + 1);
      if (/max-age=0/i.test(raw) || value === "") {
        this.cookies.delete(pair.slice(0, index));
      } else {
        this.cookies.set(pair.slice(0, index), value);
      }
    }
    return response;
  }
  has(name: string) {
    return this.cookies.has(name);
  }
  headers(extra: Record<string, string> = {}) {
    const csrf = this.cookies.get("nas_cloud_csrf");
    return {
      cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "),
      ...(csrf ? { "x-nas-csrf": decodeURIComponent(csrf) } : {}),
      ...extra
    };
  }
}

const json = (body: unknown) => JSON.stringify(body);

async function post(modulePath: string, url: string, jar: Jar, body?: unknown, headers: Record<string, string> = {}) {
  const { POST } = await import(modulePath);
  return jar.absorb(
    await POST(
      new Request(`http://localhost${url}`, {
        method: "POST",
        headers: jar.headers({ "content-type": "application/json", ...headers }),
        body: body === undefined ? undefined : json(body)
      })
    )
  );
}

async function get(modulePath: string, url: string, jar: Jar) {
  const { GET } = await import(modulePath);
  return jar.absorb(await GET(new Request(`http://localhost${url}`, { headers: jar.headers() })));
}

const listFiles = (jar: Jar) => get("@/app/api/files/route", "/api/files", jar);

async function createOwner() {
  const jar = new Jar();
  const setupCode = createMetadataRepository(db).getOrCreateSetupCode();
  const response = await post("@/app/api/auth/setup/route", "/api/auth/setup", jar, {
    email: "owner@example.test",
    name: "Owner",
    password: PASSWORD,
    setupCode
  });
  expect(response.status).toBe(201);
  return jar;
}

async function enroll(jar: Jar) {
  const setup = await post("@/app/api/auth/two-factor/setup/route", "/api/auth/two-factor/setup", jar);
  const { secret } = (await setup.json()) as { secret: string };
  const key = base32Decode(secret);
  const enabled = await post("@/app/api/auth/two-factor/enable/route", "/api/auth/two-factor/enable", jar, {
    code: totp(key)
  });
  expect(enabled.status).toBe(200);
  const { recoveryCodes } = (await enabled.json()) as { recoveryCodes: string[] };
  return { key, recoveryCodes };
}

async function passwordStep(jar = new Jar()) {
  const response = await post("@/app/api/auth/login/route", "/api/auth/login", jar, {
    email: "owner@example.test",
    password: PASSWORD,
    deviceName: "Laptop"
  });
  return { jar, response };
}

const verify = (jar: Jar, body: Record<string, string>) =>
  post("@/app/api/auth/login/verify/route", "/api/auth/login/verify", jar, body);

// A code from a step the app hasn't seen, so replay protection doesn't refuse a fresh login.
const codeAt = (key: Buffer, stepOffset: number) => totp(key, { now: Date.now() + stepOffset * 30_000 });

describe("two-factor login", () => {
  it("lets a new owner do nothing but set up two-factor", async () => {
    const jar = await createOwner();

    const blocked = await listFiles(jar);
    const status = await get("@/app/api/auth/two-factor/route", "/api/auth/two-factor", jar);

    expect(blocked.status).toBe(403);
    await expect(blocked.json()).resolves.toEqual({ error: "two-factor setup required" });
    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toMatchObject({ enabled: false });
  });

  it("turns on only with a code from the new secret, then hands out ten recovery codes", async () => {
    const jar = await createOwner();
    const setup = await post("@/app/api/auth/two-factor/setup/route", "/api/auth/two-factor/setup", jar);
    const body = (await setup.json()) as { secret: string; otpauthUri: string; qrDataUrl: string };

    expect(body.otpauthUri).toContain(`secret=${body.secret.replace(/\s/g, "")}`);
    expect(body.qrDataUrl).toMatch(/^data:image\/gif;base64,/);

    const wrong = await post("@/app/api/auth/two-factor/enable/route", "/api/auth/two-factor/enable", jar, { code: "000000" });
    expect(wrong.status).toBe(400);

    const right = await post("@/app/api/auth/two-factor/enable/route", "/api/auth/two-factor/enable", jar, {
      code: totp(base32Decode(body.secret))
    });
    expect(right.status).toBe(200);
    expect(((await right.json()) as { recoveryCodes: string[] }).recoveryCodes).toHaveLength(10);
    expect((await listFiles(jar)).status).toBe(200);
  });

  it("refuses to set up again once it's on", async () => {
    const jar = await createOwner();
    await enroll(jar);

    expect((await post("@/app/api/auth/two-factor/setup/route", "/api/auth/two-factor/setup", jar)).status).toBe(409);
  });

  it("asks for a code after the password, and a password alone gets no session", async () => {
    const owner = await createOwner();
    const { key } = await enroll(owner);

    const { jar, response } = await passwordStep();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ twoFactorRequired: true });
    expect(jar.has("nas_cloud_session")).toBe(false);
    expect((await listFiles(jar)).status).toBe(401);

    expect((await verify(jar, { code: "000000" })).status).toBe(401);
    expect((await verify(jar, { code: codeAt(key, 1) })).status).toBe(200);
    expect(jar.has("nas_cloud_session")).toBe(true);
    expect((await listFiles(jar)).status).toBe(200);
  });

  it("won't accept the same code twice", async () => {
    const owner = await createOwner();
    const { key } = await enroll(owner);
    const code = codeAt(key, 1);

    const first = await passwordStep();
    expect((await verify(first.jar, { code })).status).toBe(200);

    const second = await passwordStep();
    expect((await verify(second.jar, { code })).status).toBe(401);
  });

  it("accepts each recovery code once", async () => {
    const owner = await createOwner();
    const { recoveryCodes } = await enroll(owner);

    const first = await passwordStep();
    expect((await verify(first.jar, { recoveryCode: recoveryCodes[0].toLowerCase() })).status).toBe(200);

    const second = await passwordStep();
    expect((await verify(second.jar, { recoveryCode: recoveryCodes[0] })).status).toBe(401);
    const status = await get("@/app/api/auth/two-factor/route", "/api/auth/two-factor", first.jar);
    await expect(status.json()).resolves.toMatchObject({ enabled: true, recoveryCodesLeft: 9 });
  });

  it("stops code guessing after ten wrong tries", async () => {
    const owner = await createOwner();
    await enroll(owner);
    const { jar } = await passwordStep();

    for (let i = 0; i < 10; i += 1) {
      expect((await verify(jar, { code: "000000" })).status).toBe(401);
    }
    expect((await verify(jar, { code: "000000" })).status).toBe(429);
  });

  it("expires an unanswered sign-in after five minutes", async () => {
    const owner = await createOwner();
    const { key } = await enroll(owner);
    const { jar } = await passwordStep();
    db.prepare("update login_challenges set expires_at = ?").run(new Date(Date.now() - 1000).toISOString());

    expect((await verify(jar, { code: codeAt(key, 1) })).status).toBe(401);
  });

  it("signs out the account's other sessions when two-factor is turned on", async () => {
    const owner = await createOwner();
    const other = (await passwordStep()).jar;
    expect(other.has("nas_cloud_session")).toBe(true);

    await enroll(owner);

    expect((await listFiles(other)).status).toBe(401);
    expect((await listFiles(owner)).status).toBe(200);
  });

  it("gives new recovery codes only for a current code, and the old ones stop working", async () => {
    const owner = await createOwner();
    const { key, recoveryCodes } = await enroll(owner);
    const route = "@/app/api/auth/two-factor/recovery-codes/route";

    expect((await post(route, "/api/auth/two-factor/recovery-codes", owner, { code: "000000" })).status).toBe(401);
    const fresh = await post(route, "/api/auth/two-factor/recovery-codes", owner, { code: codeAt(key, 1) });
    expect(fresh.status).toBe(200);
    expect(((await fresh.json()) as { recoveryCodes: string[] }).recoveryCodes).toHaveLength(10);

    const { jar } = await passwordStep();
    expect((await verify(jar, { recoveryCode: recoveryCodes[1] })).status).toBe(401);
  });

  it("voids pairing codes issued before a reset, so they can't open a session that skips two-factor", async () => {
    const owner = await createOwner();
    await enroll(owner);
    const issued = await post("@/app/api/devices/route", "/api/devices", owner, { deviceName: "Phone", deviceKind: "mobile" });
    const { pairingCode } = (await issued.json()) as { pairingCode: string };

    await post("@/app/api/maintenance/two-factor-reset/route", "/api/maintenance/two-factor-reset", new Jar(), { email: "owner@example.test" }, {
      authorization: `Bearer ${TOKEN}`
    });

    expect((await post("@/app/api/devices/pair/route", "/api/devices/pair", new Jar(), { pairingCode })).status).toBe(401);
  });

  it("lets the maintenance token reset a locked-out account, but not a signed-in session", async () => {
    const owner = await createOwner();
    await enroll(owner);
    const reset = "@/app/api/maintenance/two-factor-reset/route";

    const bySession = await post(reset, "/api/maintenance/two-factor-reset", owner, { email: "owner@example.test" });
    expect(bySession.status).toBe(403);

    const byToken = await post(reset, "/api/maintenance/two-factor-reset", new Jar(), { email: "owner@example.test" }, {
      authorization: `Bearer ${TOKEN}`
    });
    expect(byToken.status).toBe(200);
    expect((await listFiles(owner)).status).toBe(401);

    const { jar, response } = await passwordStep();
    await expect(response.json()).resolves.not.toHaveProperty("twoFactorRequired");
    expect((await listFiles(jar)).status).toBe(403);
  });
});
