import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pruneAuditLog } from "@/lib/server/audit";
import { resetAppConfigForTesting } from "@/lib/server/config";
import { type AppDatabase, createDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import type { AuditEvent, CloudFile, UserRole } from "@/lib/shared/types";
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-audit-"));
  fs.mkdirSync(path.join(dir, "storage"));
  process.env.NAS_CLOUD_STORAGE_ROOT = path.join(dir, "storage");
  resetAppConfigForTesting();
  db = createDatabase(path.join(dir, "test.sqlite"));
  state.db = db;
});

afterEach(() => {
  vi.restoreAllMocks();
  db.close();
  delete process.env.NAS_CLOUD_STORAGE_ROOT;
  resetAppConfigForTesting();
  fs.rmSync(dir, { recursive: true, force: true });
});

const person = (role: UserRole, name: string) => signedInPerson(db, role, name, `test:${PASSWORD}`);
const json = async <T>(response: Response) => (await response.json()) as T;
const entries = () => createMetadataRepository(db).listAuditEvents({ limit: 500 }).events.reverse();
const actions = () => entries().map((event) => event.action);

async function upload(who: Person, name: string): Promise<CloudFile> {
  const response = await call(who.jar, "POST", "@/app/api/files/route", `/api/files?filename=${encodeURIComponent(name)}&sourceDevice=Mac`, {
    raw: Buffer.from(`bytes of ${name}`)
  });
  expect(response.status).toBe(201);
  return (await json<{ file: CloudFile }>(response)).file;
}

const fileRoute = (sub = "") => `@/app/api/files/[id]${sub}/route`;

describe("recording", () => {
  it("records sign-ins and failed sign-ins with the reason, without telling the caller", async () => {
    const member = person("member", "member");
    const signIn = (email: string, password: string) =>
      call(new Jar(), "POST", "@/app/api/auth/login/route", "/api/auth/login", { body: { email, password } });

    expect((await signIn(member.email, "wrong-password-0000")).status).toBe(401);
    expect((await signIn("nobody@example.test", PASSWORD)).status).toBe(401);
    expect((await signIn(member.email, PASSWORD)).status).toBe(200);

    const [wrong, unknown, challenge] = entries();
    expect(wrong).toMatchObject({ action: "sign_in_failed", userId: member.id, userEmail: member.email, detail: { reason: "wrong password" } });
    expect(unknown).toMatchObject({ action: "sign_in_failed", userId: null, detail: { email: "nobody@example.test", reason: "no such account" } });
    // Two-factor is on, so the password alone isn't a sign-in yet.
    expect(challenge).toBeUndefined();
  });

  it("records what happens to a file and its share links, naming who did it", async () => {
    const owner = person("owner", "owner");
    const project = createMetadataRepository(db).createProject({ name: "Client" });
    const file = await upload(owner, "contract.pdf");
    const params = { id: file.id };

    await call(owner.jar, "GET", fileRoute("/download"), `/api/files/${file.id}/download`, { params });
    await call(owner.jar, "GET", fileRoute("/download"), `/api/files/${file.id}/download`, { params, headers: { range: "bytes=10-" } });
    await call(owner.jar, "PATCH", fileRoute(), `/api/files/${file.id}`, { params, body: { name: "contract-v2.pdf" } });
    await call(owner.jar, "PATCH", fileRoute(), `/api/files/${file.id}`, { params, body: { projectId: project.id } });
    const created = await call(owner.jar, "POST", fileRoute("/shares"), `/api/files/${file.id}/shares`, { params, body: { expiresInHours: 24 } });
    const { share } = await json<{ share: { id: string } }>(created);
    const shareParams = { id: file.id, shareId: share.id };
    await call(owner.jar, "PATCH", fileRoute("/shares/[shareId]"), `/api/files/${file.id}/shares/${share.id}`, {
      params: shareParams,
      body: { label: "for the client" }
    });
    await call(owner.jar, "DELETE", fileRoute("/shares/[shareId]"), `/api/files/${file.id}/shares/${share.id}`, { params: shareParams });
    await call(owner.jar, "POST", fileRoute("/archive"), `/api/files/${file.id}/archive`, { params });
    await call(owner.jar, "POST", fileRoute("/restore"), `/api/files/${file.id}/restore`, { params });
    await call(owner.jar, "POST", fileRoute("/archive"), `/api/files/${file.id}/archive`, { params });
    await call(owner.jar, "DELETE", fileRoute("/delete"), `/api/files/${file.id}/delete`, { params });

    expect(actions()).toEqual([
      "file_uploaded",
      "file_downloaded",
      "file_renamed",
      "file_moved",
      "share_created",
      "share_updated",
      "share_revoked",
      "file_archived",
      "file_restored",
      "file_archived",
      "file_deleted"
    ]);
    const byAction = (action: string) => entries().find((event) => event.action === action);
    expect(byAction("file_renamed")).toMatchObject({ targetLabel: "contract-v2.pdf", detail: { from: "contract.pdf" } });
    expect(byAction("file_moved")).toMatchObject({ detail: { from: "Inbox", to: "Client" } });
    expect(entries().every((event) => event.userEmail === owner.email && event.targetId === file.id)).toBe(true);
  });

  it("records account and access changes, and keeps naming someone after they're removed", async () => {
    const owner = person("owner", "owner");
    const invited = await call(owner.jar, "POST", "@/app/api/invites/route", "/api/invites", { body: { role: "member" } });
    const token = (await json<{ path: string }>(invited)).path.split("/").pop();
    const joined = await call(new Jar(), "POST", "@/app/api/invites/accept/route", "/api/invites/accept", {
      body: { token, email: "temp@example.test", name: "Temp", password: PASSWORD }
    });
    const { user } = await json<{ user: { id: string } }>(joined);
    const project = createMetadataRepository(db).createProject({ name: "Client" });
    const userParams = { id: user.id };

    await call(owner.jar, "PATCH", "@/app/api/projects/[id]/members/[userId]/route", `/api/projects/${project.id}/members/${user.id}`, {
      params: { id: project.id, userId: user.id },
      body: { access: "view" }
    });
    await call(owner.jar, "PATCH", "@/app/api/users/[id]/route", `/api/users/${user.id}`, { params: userParams, body: { role: "admin" } });
    await call(owner.jar, "PATCH", "@/app/api/users/[id]/route", `/api/users/${user.id}`, { params: userParams, body: { disabled: true } });
    await call(owner.jar, "DELETE", "@/app/api/users/[id]/route", `/api/users/${user.id}`, { params: userParams });

    expect(actions()).toEqual([
      "invite_created",
      "account_created",
      "project_member_set",
      "user_role_changed",
      "user_disabled",
      "user_removed"
    ]);
    const all = entries();
    expect(all[1]).toMatchObject({ userId: user.id, userEmail: "temp@example.test", detail: { via: "invite", role: "member" } });
    expect(all[2]).toMatchObject({ targetLabel: "Client", detail: { member: "temp@example.test", access: "view" } });
    expect(all[3]).toMatchObject({ targetLabel: "temp@example.test", detail: { from: "member", to: "admin" } });
    expect(createMetadataRepository(db).getUserById(user.id)).toBeNull();
  });
});

describe("recording, when things go wrong", () => {
  it("still answers success for an action whose audit entry couldn't be written", async () => {
    const owner = person("owner", "owner");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.exec("drop table audit_events");

    await upload(owner, "kept.txt");
    expect(console.error).toHaveBeenCalledWith("[audit] could not record file_uploaded", expect.any(Error));
  });

  it("names the device that was removed, and keeps removed people pickable", async () => {
    const owner = person("owner", "owner");
    const leaver = person("member", "leaver");
    const repo = createMetadataRepository(db);
    const device = repo.createDevice({ userId: owner.id, name: "Front desk PC", kind: "desktop" });
    await call(owner.jar, "DELETE", "@/app/api/devices/[id]/route", `/api/devices/${device.id}`, { params: { id: device.id } });
    await upload(leaver, "handover.txt");
    await call(owner.jar, "DELETE", "@/app/api/users/[id]/route", `/api/users/${leaver.id}`, { params: { id: leaver.id } });

    expect(entries().find((event) => event.action === "device_removed")).toMatchObject({ targetLabel: "Front desk PC" });
    expect(repo.listAuditPeople()).toContainEqual({ id: leaver.id, email: leaver.email });
  });
});

describe("reading", () => {
  it("keeps the log to admins", async () => {
    const member = person("member", "member");
    expect((await call(member.jar, "GET", "@/app/api/audit/route", "/api/audit")).status).toBe(403);
    expect((await call(member.jar, "GET", "@/app/api/audit/export/route", "/api/audit/export")).status).toBe(403);
  });

  it("filters by person, action and date, newest first, in pages", async () => {
    const owner = person("owner", "owner");
    const member = person("member", "member");
    const repo = createMetadataRepository(db);
    for (let index = 0; index < 105; index++) {
      repo.recordAuditEvent({ userId: member.id, action: "file_downloaded", target: { type: "file", id: `file_${index}` } });
    }
    repo.recordAuditEvent({ userId: owner.id, action: "project_created" });
    db.prepare("update audit_events set created_at = '2025-01-15T12:00:00.000Z' where action = 'project_created'").run();
    const list = async (query: string) =>
      json<{ events: AuditEvent[]; nextCursor: string | null }>(await call(owner.jar, "GET", "@/app/api/audit/route", `/api/audit?${query}`));

    const first = await list(`userId=${member.id}`);
    expect(first.events).toHaveLength(100);
    expect(first.nextCursor).not.toBeNull();
    const second = await list(`userId=${member.id}&cursor=${encodeURIComponent(first.nextCursor ?? "")}`);
    expect(second.events).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.events, ...second.events].map((event) => event.id)).size).toBe(105);

    expect((await list("action=project_created")).events.map((event) => event.userId)).toEqual([owner.id]);
    expect((await list("from=2025-01-01T00:00:00.000Z&to=2025-02-01T00:00:00.000Z")).events).toHaveLength(1);
    expect((await call(owner.jar, "GET", "@/app/api/audit/route", "/api/audit?action=not_real")).status).toBe(400);
    expect((await call(owner.jar, "GET", "@/app/api/audit/route", "/api/audit?cursor=abc")).status).toBe(400);
  });

  it("exports CSV that a spreadsheet won't run as formulas, and records the export", async () => {
    const owner = person("owner", "owner");
    await upload(owner, "=HYPERLINK(\"http://evil\").txt");

    const response = await call(owner.jar, "GET", "@/app/api/audit/export/route", "/api/audit/export?action=file_uploaded");
    expect(response.headers.get("content-type")).toContain("text/csv");
    const lines = (await response.text()).trim().split("\r\n");

    expect(lines[0]).toBe('"Time","Person","Action","Target type","Target","Target ID","IP","Detail"');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://evil"").txt"`);
    expect(entries().at(-1)).toMatchObject({ action: "audit_exported", userId: owner.id, detail: { action: "file_uploaded" } });
  });

  it("prunes entries older than 365 days", () => {
    const repo = createMetadataRepository(db);
    repo.recordAuditEvent({ userId: null, action: "sign_in_failed" });
    repo.recordAuditEvent({ userId: null, action: "sign_in_failed" });
    db.prepare("update audit_events set created_at = ? where rowid = (select min(rowid) from audit_events)").run(
      new Date(Date.now() - 366 * 24 * 60 * 60 * 1000).toISOString()
    );

    expect(pruneAuditLog()).toBe(1);
    expect(entries()).toHaveLength(1);
  });
});
