import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAppConfigForTesting } from "@/lib/server/config";
import { type AppDatabase, createDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import type { CloudFile, Project, UserRole } from "@/lib/shared/types";
import { type Person, signedInPerson } from "../helpers/people";
import { Jar, call } from "../helpers/routeClient";

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
let dir: string;
let db: AppDatabase;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-team-"));
  fs.mkdirSync(path.join(dir, "storage"));
  process.env.NAS_CLOUD_STORAGE_ROOT = path.join(dir, "storage");
  resetAppConfigForTesting();
  db = createDatabase(path.join(dir, "test.sqlite"));
  state.db = db;
});

afterEach(() => {
  db.close();
  delete process.env.NAS_CLOUD_STORAGE_ROOT;
  resetAppConfigForTesting();
  fs.rmSync(dir, { recursive: true, force: true });
});

const person = (role: UserRole, name: string) => signedInPerson(db, role, name, `test:${PASSWORD}`);
const json = async <T>(response: Response) => (await response.json()) as T;
const userRoute = (sub = "") => `@/app/api/users/[id]${sub}/route`;

async function invite(who: Person, role: UserRole) {
  return call(who.jar, "POST", "@/app/api/invites/route", "/api/invites", { body: { role } });
}

async function inviteToken(who: Person, role: UserRole = "member"): Promise<string> {
  const response = await invite(who, role);
  expect(response.status).toBe(201);
  const { path: invitePath } = await json<{ path: string }>(response);
  return invitePath.split("/").pop() ?? "";
}

function accept(token: string, email = "new@example.test", jar = new Jar()) {
  return call(jar, "POST", "@/app/api/invites/accept/route", "/api/invites/accept", {
    body: { token, email, name: "New Person", password: PASSWORD }
  });
}

function signIn(email: string) {
  return call(new Jar(), "POST", "@/app/api/auth/login/route", "/api/auth/login", { body: { email, password: PASSWORD } });
}

const listFiles = (jar: Jar) => call(jar, "GET", "@/app/api/files/route", "/api/files");

describe("invites", () => {
  it("lets an invited person set a password, after which two-factor setup is all they can reach", async () => {
    const owner = person("owner", "owner");
    const token = await inviteToken(owner);
    const jar = new Jar();

    const accepted = await accept(token, "new@example.test", jar);
    expect(accepted.status).toBe(201);
    expect(jar.has("nas_cloud_session")).toBe(true);
    expect((await listFiles(jar)).status).toBe(403);
    const created = createMetadataRepository(db).getUserByEmail("new@example.test");
    expect(created?.role).toBe("member");
  });

  it("works once, and not after it expires", async () => {
    const owner = person("owner", "owner");
    const used = await inviteToken(owner);
    expect((await accept(used, "first@example.test")).status).toBe(201);
    expect((await accept(used, "second@example.test")).status).toBe(404);

    const stale = await inviteToken(owner);
    db.prepare("update invites set expires_at = ?").run(new Date(Date.now() - 1000).toISOString());
    expect((await accept(stale, "third@example.test")).status).toBe(404);
  });

  it("refuses an email that already has an account", async () => {
    const owner = person("owner", "owner");
    expect((await accept(await inviteToken(owner), owner.email)).status).toBe(409);
  });

  it("lets owners invite any role, admins only members, and members nobody", async () => {
    const owner = person("owner", "owner");
    const admin = person("admin", "admin");
    const member = person("member", "member");

    expect((await invite(owner, "admin")).status).toBe(201);
    expect((await invite(owner, "owner")).status).toBe(201);
    expect((await invite(admin, "member")).status).toBe(201);
    expect((await invite(admin, "admin")).status).toBe(403);
    expect((await invite(member, "member")).status).toBe(403);
  });

  it("lists pending invites for admins, and a revoked one stops working", async () => {
    const owner = person("owner", "owner");
    const token = await inviteToken(owner);
    const listed = await json<{ invites: Array<{ id: string; role: UserRole }> }>(
      await call(owner.jar, "GET", "@/app/api/invites/route", "/api/invites")
    );
    expect(listed.invites).toHaveLength(1);

    const id = listed.invites[0].id;
    expect((await call(owner.jar, "DELETE", "@/app/api/invites/[id]/route", `/api/invites/${id}`, { params: { id } })).status).toBe(200);
    expect((await accept(token)).status).toBe(404);
  });

  it("limits how often invite links can be tried", async () => {
    let status = 0;
    for (let i = 0; i < 21; i += 1) {
      status = (await accept(`not-a-token-${i}`)).status;
    }
    expect(status).toBe(429);
  });
});

describe("people", () => {
  it("lists everyone for admins only", async () => {
    const owner = person("owner", "owner");
    const member = person("member", "member");

    const listed = await call(owner.jar, "GET", "@/app/api/users/route", "/api/users");
    const { users } = await json<{ users: Array<{ email: string; role: UserRole; twoFactorEnabled: boolean; disabled: boolean }> }>(listed);
    expect(users.map((user) => user.email).sort()).toEqual([member.email, owner.email].sort());
    expect(users.every((user) => user.twoFactorEnabled && !user.disabled)).toBe(true);
    expect((await call(member.jar, "GET", "@/app/api/users/route", "/api/users")).status).toBe(403);
  });

  it("signs a disabled person out everywhere and refuses their password until re-enabled", async () => {
    const owner = person("owner", "owner");
    const member = person("member", "member");
    const params = { id: member.id };
    const patch = (body: unknown) => call(owner.jar, "PATCH", userRoute(), `/api/users/${member.id}`, { params, body });

    expect((await patch({ disabled: true })).status).toBe(200);
    expect((await listFiles(member.jar)).status).toBe(401);
    expect((await signIn(member.email)).status).toBe(401);

    expect((await patch({ disabled: false })).status).toBe(200);
    const again = await signIn(member.email);
    expect(again.status).toBe(200);
    await expect(again.json()).resolves.toEqual({ twoFactorRequired: true });
  });

  it("keeps a removed person's uploads, leaving their Inbox files to admins", async () => {
    const owner = person("owner", "owner");
    const member = person("member", "member");
    const uploaded = await call(member.jar, "POST", "@/app/api/files/route", "/api/files?filename=notes.txt&sourceDevice=Mac", {
      raw: Buffer.from("notes")
    });
    const { file } = await json<{ file: CloudFile }>(uploaded);

    expect((await call(owner.jar, "DELETE", userRoute(), `/api/users/${member.id}`, { params: { id: member.id } })).status).toBe(200);

    const kept = createMetadataRepository(db).getFileById(file.id);
    expect(kept?.uploadedBy).toBeNull();
    expect((await call(owner.jar, "GET", "@/app/api/files/[id]/route", `/api/files/${file.id}`, { params: { id: file.id } })).status).toBe(200);
    expect(createMetadataRepository(db).getUserByEmail(member.email)).toBeNull();
  });

  it("lets owners manage everyone and admins only members, and nobody change their own account", async () => {
    const owner = person("owner", "owner");
    const otherOwner = person("owner", "other-owner");
    const admin = person("admin", "admin");
    const otherAdmin = person("admin", "other-admin");
    const member = person("member", "member");
    const otherMember = person("member", "other-member");
    const patch = (who: Person, target: Person, body: unknown) =>
      call(who.jar, "PATCH", userRoute(), `/api/users/${target.id}`, { params: { id: target.id }, body });

    expect((await patch(admin, owner, { disabled: true })).status).toBe(403);
    expect((await patch(admin, otherAdmin, { role: "member" })).status).toBe(403);
    expect((await patch(admin, member, { role: "admin" })).status).toBe(403);
    expect((await patch(admin, otherMember, { disabled: true })).status).toBe(200);
    expect((await patch(owner, owner, { role: "member" })).status).toBe(403);
    expect((await call(owner.jar, "DELETE", userRoute(), `/api/users/${owner.id}`, { params: { id: owner.id } })).status).toBe(403);
    expect((await patch(owner, otherAdmin, { role: "member" })).status).toBe(200);
    expect((await patch(owner, otherOwner, { role: "admin" })).status).toBe(200);
    expect((await patch(member, admin, { role: "member" })).status).toBe(403);
  });

  it("resets someone's two-factor, signing them out so their next sign-in goes to setup", async () => {
    const owner = person("owner", "owner");
    const member = person("member", "member");

    const reset = await call(owner.jar, "POST", userRoute("/two-factor-reset"), `/api/users/${member.id}/two-factor-reset`, {
      params: { id: member.id }
    });

    expect(reset.status).toBe(200);
    expect((await listFiles(member.jar)).status).toBe(401);
    await expect((await signIn(member.email)).json()).resolves.not.toHaveProperty("twoFactorRequired");
  });
});

describe("project members", () => {
  it("lets admins add, change and remove a member's access to a project", async () => {
    const owner = person("owner", "owner");
    const admin = person("admin", "admin");
    const member = person("member", "member");
    const project = createMetadataRepository(db).createProject({ name: "Client" });
    const memberRoute = "@/app/api/projects/[id]/members/[userId]/route";
    const set = (who: Person, userId: string, access: string) =>
      call(who.jar, "PATCH", memberRoute, `/api/projects/${project.id}/members/${userId}`, {
        params: { id: project.id, userId },
        body: { access }
      });
    const visible = async () =>
      (await json<{ projects: Project[] }>(await call(member.jar, "GET", "@/app/api/projects/route", "/api/projects"))).projects.length;

    expect((await set(member, member.id, "edit")).status).toBe(403);
    expect((await set(owner, admin.id, "view")).status).toBe(400);
    expect((await set(owner, member.id, "view")).status).toBe(200);
    expect(await visible()).toBe(1);

    expect((await set(owner, member.id, "edit")).status).toBe(200);
    const listed = await json<{ members: Array<{ userId: string; access: string }> }>(
      await call(owner.jar, "GET", "@/app/api/projects/[id]/members/route", `/api/projects/${project.id}/members`, {
        params: { id: project.id }
      })
    );
    expect(listed.members).toEqual([expect.objectContaining({ userId: member.id, access: "edit" })]);

    const removed = await call(owner.jar, "DELETE", memberRoute, `/api/projects/${project.id}/members/${member.id}`, {
      params: { id: project.id, userId: member.id }
    });
    expect(removed.status).toBe(200);
    expect(await visible()).toBe(0);
  });
});
