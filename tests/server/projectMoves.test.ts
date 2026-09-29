import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AppDatabase, createDatabase } from "@/lib/server/db";
import { resetAppConfigForTesting } from "@/lib/server/config";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("@/lib/server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/db")>()),
  getDatabase: () => state.db
}));
vi.mock("@/lib/server/auth/guards", () => ({
  requireApiSession: vi.fn(async () => ({ ok: true, userId: "user_1", sessionId: "s", deviceId: "d" }))
}));

let dir: string;
let root: string;
let db: AppDatabase;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-project-moves-"));
  root = path.join(dir, "storage");
  process.env.NAS_CLOUD_STORAGE_ROOT = root;
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

function fileInProject(storagePath: string) {
  const repo = createMetadataRepository(db);
  const project = repo.createProject({ name: "Drone" });
  fs.mkdirSync(path.dirname(path.join(root, storagePath)), { recursive: true });
  fs.writeFileSync(path.join(root, storagePath), "solid");
  const file = repo.createFile({
    name: path.posix.basename(storagePath),
    extension: "stl",
    family: "cad",
    mimeType: "model/stl",
    sizeBytes: 5,
    checksum: "abc",
    storagePath,
    projectId: project.id,
    sourceDevice: "Laptop"
  });
  return { repo, project, file };
}

async function patch(fileId: string, body: unknown) {
  const { PATCH } = await import("@/app/api/files/[id]/route");
  return PATCH(
    new Request(`http://localhost/api/files/${fileId}`, { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: fileId }) }
  );
}

const onDisk = (relative: string) => fs.readdirSync(path.join(root, relative)).sort();

describe("assigning a file to the project it is already in", () => {
  it("leaves the file where it is instead of renaming it to name-2", async () => {
    const { project, file } = fileInProject("Projects/drone/Inbox/top.stl");

    const response = await patch(file.id, { projectId: project.id });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      file: { storagePath: "Projects/drone/Inbox/top.stl", projectId: project.id }
    });
    expect(onDisk("Projects/drone/Inbox")).toEqual(["top.stl"]);
  });

  it("keeps a file that sits in a subfolder of the project in that subfolder", async () => {
    const { project, file } = fileInProject("Projects/drone/Inbox/frame/arm.stl");

    const response = await patch(file.id, { projectId: project.id });

    await expect(response.json()).resolves.toMatchObject({ file: { storagePath: "Projects/drone/Inbox/frame/arm.stl" } });
    expect(onDisk("Projects/drone/Inbox/frame")).toEqual(["arm.stl"]);
    expect(onDisk("Projects/drone/Inbox")).toEqual(["frame"]);
  });

  it("changes only the category when the project is resent unchanged", async () => {
    const { project, file } = fileInProject("Projects/drone/Inbox/frame/arm.stl");

    const response = await patch(file.id, { projectId: project.id, categoryId: "cat_cad" });

    await expect(response.json()).resolves.toMatchObject({
      file: { storagePath: "Projects/drone/Inbox/frame/arm.stl", projectId: project.id, categoryId: "cat_cad" }
    });
    expect(onDisk("Projects/drone/Inbox/frame")).toEqual(["arm.stl"]);
  });

  it("still renames in place when a new name is sent with the same project", async () => {
    const { project, file } = fileInProject("Projects/drone/Inbox/frame/arm.stl");

    const response = await patch(file.id, { projectId: project.id, name: "arm-v2.stl" });

    await expect(response.json()).resolves.toMatchObject({
      file: { name: "arm-v2.stl", storagePath: "Projects/drone/Inbox/frame/arm-v2.stl" }
    });
    expect(onDisk("Projects/drone/Inbox/frame")).toEqual(["arm-v2.stl"]);
  });

  it("does not touch the file when only the category changes", async () => {
    const { file } = fileInProject("Projects/drone/Inbox/frame/arm.stl");

    const response = await patch(file.id, { categoryId: "cat_cad" });

    await expect(response.json()).resolves.toMatchObject({
      file: { storagePath: "Projects/drone/Inbox/frame/arm.stl", categoryId: "cat_cad" }
    });
  });
});

describe("storage moves onto the file's own path", () => {
  it("return the current path instead of allocating name-2", async () => {
    fs.mkdirSync(path.join(root, "Projects", "drone", "Inbox"), { recursive: true });
    fs.mkdirSync(path.join(root, "Inbox", "Laptop"), { recursive: true });
    fs.writeFileSync(path.join(root, "Projects", "drone", "Inbox", "top.stl"), "solid");
    fs.writeFileSync(path.join(root, "Inbox", "Laptop", "loose.stl"), "solid");
    const storage = createStorageService(root);

    const project = await storage.moveToProject({
      currentRelativePath: "Projects/drone/Inbox/top.stl",
      projectSlug: "drone",
      filename: "top.stl"
    });
    const inbox = await storage.moveToInbox({
      currentRelativePath: "Inbox/Laptop/loose.stl",
      sourceDevice: "Laptop",
      filename: "loose.stl"
    });

    expect(project.relativePath).toBe("Projects/drone/Inbox/top.stl");
    expect(inbox.relativePath).toBe("Inbox/Laptop/loose.stl");
    expect(onDisk("Projects/drone/Inbox")).toEqual(["top.stl"]);
    expect(onDisk("Inbox/Laptop")).toEqual(["loose.stl"]);
  });
});
