import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, hashSessionToken, sessionExpiresAt } from "@/lib/server/auth/sessions";
import { resetAppConfigForTesting } from "@/lib/server/config";
import { type AppDatabase, createDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import type { CloudFile, Project, UserRole } from "@/lib/shared/types";
import { Jar, call } from "../helpers/routeClient";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("@/lib/server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/db")>()),
  getDatabase: () => state.db
}));

let dir: string;
let db: AppDatabase;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-access-"));
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

type Person = { id: string; jar: Jar };

function person(role: UserRole, name: string): Person {
  const repo = createMetadataRepository(db);
  const user = repo.createUser({ email: `${name}@example.test`, name, passwordHash: "x", role });
  db.prepare("update users set totp_enabled_at = ? where id = ?").run(new Date().toISOString(), user.id);
  const token = createSessionToken();
  repo.createSession({ userId: user.id, tokenHash: hashSessionToken(token), expiresAt: sessionExpiresAt() });
  const jar = new Jar();
  jar.cookies.set("nas_cloud_session", token);
  jar.cookies.set("nas_cloud_csrf", "csrf-token-for-tests");
  return { id: user.id, jar };
}

async function upload(who: Person, name: string, project?: Project): Promise<Response> {
  const query = new URLSearchParams({ filename: name, sourceDevice: "Mac" });
  if (project) {
    query.set("projectId", project.id);
    query.set("projectSlug", project.slug);
  }
  return call(who.jar, "POST", "@/app/api/files/route", `/api/files?${query}`, { raw: Buffer.from(`bytes of ${name}`) });
}

async function uploaded(who: Person, name: string, project?: Project): Promise<CloudFile> {
  const response = await upload(who, name, project);
  expect(response.status).toBe(201);
  return ((await response.json()) as { file: CloudFile }).file;
}

const fileRoute = (sub = "") => `@/app/api/files/[id]${sub}/route`;
const json = async <T>(response: Response) => (await response.json()) as T;
const names = (files: CloudFile[]) => files.map((file) => file.name).sort();

async function world() {
  const owner = person("owner", "owner");
  const admin = person("admin", "admin");
  const editor = person("member", "editor");
  const viewer = person("member", "viewer");
  const outsider = person("member", "outsider");
  const repo = createMetadataRepository(db);
  const shared = repo.createProject({ name: "Shared" });
  const restricted = repo.createProject({ name: "Restricted" });
  repo.setProjectMember(shared.id, editor.id, "edit");
  repo.setProjectMember(shared.id, viewer.id, "view");

  const files = {
    shared: await uploaded(owner, "doc-shared.txt", shared),
    restricted: await uploaded(owner, "doc-restricted.txt", restricted),
    editorInbox: await uploaded(editor, "doc-editor-inbox.txt"),
    ownerInbox: await uploaded(owner, "doc-owner-inbox.txt")
  };
  return { owner, admin, editor, viewer, outsider, shared, restricted, files };
}

describe("who sees what", () => {
  it("filters every file listing to what each person can reach", async () => {
    const w = await world();
    const everything = ["doc-editor-inbox.txt", "doc-owner-inbox.txt", "doc-restricted.txt", "doc-shared.txt"];
    const expected: Array<[Person, string[]]> = [
      [w.owner, everything],
      [w.admin, everything],
      [w.editor, ["doc-editor-inbox.txt", "doc-shared.txt"]],
      [w.viewer, ["doc-shared.txt"]],
      [w.outsider, []]
    ];

    for (const [who, visible] of expected) {
      const listed = await json<{ files: CloudFile[] }>(await call(who.jar, "GET", "@/app/api/files/route", "/api/files"));
      const searched = await json<{ files: CloudFile[] }>(await call(who.jar, "GET", "@/app/api/search/route", "/api/search?q=doc-"));
      const recent = await json<{ files: CloudFile[] }>(
        await call(who.jar, "GET", "@/app/api/smart-views/[view]/route", "/api/smart-views/recent", { params: { view: "recent" } })
      );
      expect(names(listed.files)).toEqual(visible);
      expect(names(searched.files)).toEqual(visible);
      expect(names(recent.files)).toEqual(visible);
    }
  });

  it("lists only the projects someone belongs to, and all of them for admins", async () => {
    const w = await world();
    const projectNames = async (who: Person) =>
      (await json<{ projects: Project[] }>(await call(who.jar, "GET", "@/app/api/projects/route", "/api/projects"))).projects
        .map((project) => project.name)
        .sort();

    expect(await projectNames(w.owner)).toEqual(["Restricted", "Shared"]);
    expect(await projectNames(w.admin)).toEqual(["Restricted", "Shared"]);
    expect(await projectNames(w.editor)).toEqual(["Shared"]);
    expect(await projectNames(w.viewer)).toEqual(["Shared"]);
    expect(await projectNames(w.outsider)).toEqual([]);
  });

  it("answers 404 for a file out of reach, exactly as for one that doesn't exist", async () => {
    const w = await world();
    const reach: Array<[Person, Array<keyof typeof w.files>]> = [
      [w.admin, ["shared", "restricted", "editorInbox", "ownerInbox"]],
      [w.editor, ["shared", "editorInbox"]],
      [w.viewer, ["shared"]],
      [w.outsider, []]
    ];

    for (const [who, allowed] of reach) {
      for (const key of Object.keys(w.files) as Array<keyof typeof w.files>) {
        const id = w.files[key].id;
        const status = allowed.includes(key) ? 200 : 404;
        expect((await call(who.jar, "GET", fileRoute(), `/api/files/${id}`, { params: { id } })).status, `${key}`).toBe(status);
        expect((await call(who.jar, "GET", fileRoute("/download"), `/api/files/${id}/download`, { params: { id } })).status).toBe(status);
      }
    }
    const missing = await call(w.outsider.jar, "GET", fileRoute(), "/api/files/file_nope", { params: { id: "file_nope" } });
    const hidden = await call(w.outsider.jar, "GET", fileRoute(), `/api/files/${w.files.shared.id}`, { params: { id: w.files.shared.id } });
    expect(await hidden.json()).toEqual(await missing.json());
  });
});

describe("changing files", () => {
  it("lets view-only access read but not change anything", async () => {
    const w = await world();
    const id = w.files.shared.id;
    const asViewer = (method: "POST" | "PATCH" | "GET", sub: string, body?: unknown) =>
      call(w.viewer.jar, method, fileRoute(sub), `/api/files/${id}${sub}`, { params: { id }, body });

    expect((await asViewer("PATCH", "", { name: "renamed.txt" })).status).toBe(403);
    expect((await asViewer("POST", "/archive")).status).toBe(403);
    expect((await asViewer("POST", "/shares", {})).status).toBe(403);
    expect((await asViewer("GET", "/shares")).status).toBe(403);

    const asEditor = await call(w.editor.jar, "PATCH", fileRoute(), `/api/files/${id}`, { params: { id }, body: { name: "renamed.txt" } });
    expect(asEditor.status).toBe(200);
  });

  it("needs edit access on the destination project to move a file there", async () => {
    const w = await world();
    const id = w.files.editorInbox.id;
    const move = (who: Person, projectId: string) =>
      call(who.jar, "PATCH", fileRoute(), `/api/files/${id}`, { params: { id }, body: { projectId } });

    expect((await move(w.editor, w.restricted.id)).status).toBe(404);
    expect((await move(w.editor, w.shared.id)).status).toBe(200);
  });

  it("checks every file in a bulk action, and refuses the whole batch if one is out of reach", async () => {
    const w = await world();
    const bulk = (who: Person, fileIds: string[]) =>
      call(who.jar, "POST", "@/app/api/files/bulk/route", "/api/files/bulk", { body: { fileIds, categoryId: null } });
    const zip = (who: Person, fileIds: string[]) =>
      call(who.jar, "GET", "@/app/api/files/bulk/download/route", `/api/files/bulk/download?${fileIds.map((id) => `fileIds=${id}`).join("&")}`);

    expect((await zip(w.editor, [w.files.shared.id, w.files.editorInbox.id])).status).toBe(200);
    expect((await zip(w.editor, [w.files.shared.id, w.files.ownerInbox.id])).status).toBe(404);
    expect((await bulk(w.viewer, [w.files.shared.id])).status).toBe(403);
    expect((await bulk(w.editor, [w.files.shared.id, w.files.restricted.id])).status).toBe(404);
    expect((await bulk(w.editor, [w.files.shared.id, w.files.editorInbox.id])).status).toBe(200);
  });

  it("needs edit access to archive or delete, and hides archived files the same way", async () => {
    const w = await world();
    const id = w.files.editorInbox.id;
    const act = (who: Person, method: "POST" | "DELETE", sub: string) =>
      call(who.jar, method, fileRoute(sub), `/api/files/${id}${sub}`, { params: { id } });

    expect((await act(w.viewer, "POST", "/archive")).status).toBe(404);
    expect((await act(w.editor, "POST", "/archive")).status).toBe(200);
    expect((await act(w.viewer, "DELETE", "/delete")).status).toBe(404);
    expect((await act(w.editor, "DELETE", "/delete")).status).toBe(200);
  });

  it("keeps share links to people who can edit the file", async () => {
    const w = await world();
    const id = w.files.shared.id;
    const created = await call(w.editor.jar, "POST", fileRoute("/shares"), `/api/files/${id}/shares`, { params: { id }, body: {} });
    expect(created.status).toBe(201);
    const shareId = (await json<{ share: { id: string } }>(created)).share.id;
    const shareRoute = (sub = "") => `@/app/api/files/[id]/shares/[shareId]${sub}/route`;
    const params = { id, shareId };

    expect((await call(w.viewer.jar, "PATCH", shareRoute(), `/api/files/${id}/shares/${shareId}`, { params, body: { label: "x" } })).status).toBe(403);
    expect((await call(w.viewer.jar, "GET", shareRoute("/events"), `/api/files/${id}/shares/${shareId}/events`, { params })).status).toBe(403);
    expect((await call(w.outsider.jar, "DELETE", shareRoute(), `/api/files/${id}/shares/${shareId}`, { params })).status).toBe(404);
    expect((await call(w.editor.jar, "DELETE", shareRoute(), `/api/files/${id}/shares/${shareId}`, { params })).status).toBe(200);
  });

  it("lets admins change anything", async () => {
    const w = await world();
    const id = w.files.editorInbox.id;
    const renamed = await call(w.admin.jar, "PATCH", fileRoute(), `/api/files/${id}`, { params: { id }, body: { name: "by-admin.txt" } });
    expect(renamed.status).toBe(200);
  });
});

describe("uploads", () => {
  it("records the uploader and needs edit access to upload into a project", async () => {
    const w = await world();

    expect((await uploaded(w.editor, "editor-upload.txt", w.shared)).uploadedBy).toBe(w.editor.id);
    expect((await upload(w.viewer, "viewer-upload.txt", w.shared)).status).toBe(403);
    expect((await upload(w.outsider, "outsider-upload.txt", w.shared)).status).toBe(404);
  });

  it("keeps an Inbox upload private to the uploader and admins", async () => {
    const w = await world();
    const file = await uploaded(w.outsider, "outsider-inbox.txt");
    const status = async (who: Person) =>
      (await call(who.jar, "GET", fileRoute(), `/api/files/${file.id}`, { params: { id: file.id } })).status;

    expect(await status(w.outsider)).toBe(200);
    expect(await status(w.admin)).toBe(200);
    expect(await status(w.editor)).toBe(404);
  });

  it("only lets the person who opened an upload session add to it, finish it or abort it", async () => {
    const w = await world();
    const opened = await call(w.editor.jar, "POST", "@/app/api/upload-sessions/route", "/api/upload-sessions", {
      body: { filename: "chunked.txt", sizeBytes: 5, sourceDevice: "Mac" }
    });
    expect(opened.status).toBe(201);
    const { id } = (await json<{ session: { id: string } }>(opened)).session;
    const sessionRoute = (sub: string) => `@/app/api/upload-sessions/[id]/${sub}/route`;
    const chunk = (who: Person) =>
      call(who.jar, "POST", sessionRoute("chunk"), `/api/upload-sessions/${id}/chunk`, {
        params: { id },
        raw: Buffer.from("hello"),
        headers: { "upload-offset": "0" }
      });

    expect((await chunk(w.outsider)).status).toBe(404);
    expect((await call(w.outsider.jar, "POST", sessionRoute("abort"), `/api/upload-sessions/${id}/abort`, { params: { id } })).status).toBe(404);
    expect((await chunk(w.editor)).status).toBe(200);
    expect((await call(w.outsider.jar, "POST", sessionRoute("complete"), `/api/upload-sessions/${id}/complete`, { params: { id } })).status).toBe(404);
    const completed = await call(w.editor.jar, "POST", sessionRoute("complete"), `/api/upload-sessions/${id}/complete`, { params: { id } });
    expect(completed.status).toBe(201);
    expect((await json<{ file: CloudFile }>(completed)).file.uploadedBy).toBe(w.editor.id);

    const intoProject = await call(w.viewer.jar, "POST", "@/app/api/upload-sessions/route", "/api/upload-sessions", {
      body: { filename: "nope.txt", sizeBytes: 5, sourceDevice: "Mac", projectId: w.shared.id, projectSlug: w.shared.slug }
    });
    expect(intoProject.status).toBe(403);
  });
});

describe("administration", () => {
  it("keeps project, category and tag management to admins", async () => {
    const w = await world();
    const projectRoute = "@/app/api/projects/[id]/route";
    const params = { id: w.shared.id };

    expect((await call(w.editor.jar, "POST", "@/app/api/projects/route", "/api/projects", { body: { name: "Mine" } })).status).toBe(403);
    expect((await call(w.admin.jar, "POST", "@/app/api/projects/route", "/api/projects", { body: { name: "Admin's" } })).status).toBe(201);
    expect((await call(w.editor.jar, "PATCH", projectRoute, `/api/projects/${w.shared.id}`, { params, body: { name: "Renamed" } })).status).toBe(403);
    expect((await call(w.editor.jar, "DELETE", projectRoute, `/api/projects/${w.shared.id}`, { params, body: { fileAction: "detach" } })).status).toBe(403);
    expect((await call(w.admin.jar, "PATCH", projectRoute, `/api/projects/${w.shared.id}`, { params, body: { name: "Renamed" } })).status).toBe(200);

    const category = { name: "Contracts", color: "#336699" };
    expect((await call(w.editor.jar, "POST", "@/app/api/categories/route", "/api/categories", { body: category })).status).toBe(403);
    expect((await call(w.admin.jar, "POST", "@/app/api/categories/route", "/api/categories", { body: category })).status).toBe(201);
    expect((await call(w.editor.jar, "GET", "@/app/api/categories/route", "/api/categories")).status).toBe(200);

    const tag = await call(w.editor.jar, "POST", "@/app/api/tags/route", "/api/tags", { body: { name: "draft" } });
    expect(tag.status).toBe(201);
    const tagId = (await json<{ tag: { id: string } }>(tag)).tag.id;
    expect((await call(w.editor.jar, "DELETE", "@/app/api/tags/[id]/route", `/api/tags/${tagId}`, { params: { id: tagId } })).status).toBe(403);
    expect((await call(w.admin.jar, "DELETE", "@/app/api/tags/[id]/route", `/api/tags/${tagId}`, { params: { id: tagId } })).status).toBe(200);
  });

  it("needs access to a project to download it as a ZIP", async () => {
    const w = await world();
    const zip = (who: Person, project: Project) =>
      call(who.jar, "GET", "@/app/api/projects/[id]/download/route", `/api/projects/${project.id}/download`, { params: { id: project.id } });

    expect((await zip(w.viewer, w.shared)).status).toBe(200);
    expect((await zip(w.outsider, w.shared)).status).toBe(404);
    expect((await zip(w.editor, w.restricted)).status).toBe(404);
  });

  it("keeps maintenance to admins", async () => {
    const w = await world();
    const reindex = "@/app/api/maintenance/reindex/route";

    expect((await call(w.editor.jar, "POST", reindex, "/api/maintenance/reindex")).status).toBe(403);
    expect((await call(w.editor.jar, "GET", reindex, "/api/maintenance/reindex")).status).toBe(403);
    expect((await call(w.editor.jar, "GET", "@/app/api/maintenance/previews/status/route", "/api/maintenance/previews/status")).status).toBe(403);
    expect((await call(w.admin.jar, "POST", reindex, "/api/maintenance/reindex")).status).toBe(200);
    expect((await call(w.admin.jar, "GET", reindex, "/api/maintenance/reindex")).status).toBe(200);
  });
});
