import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AppDatabase, createDatabase } from "@/lib/server/db";
import { resetAppConfigForTesting } from "@/lib/server/config";
import { createMetadataRepository } from "@/lib/server/metadata";
import { processPreviewJob } from "@/lib/server/previews/worker";
import { hashShareToken } from "@/lib/server/shareLinks";
import { createStorageService } from "@/lib/server/storage";
import { readStoredZip } from "../helpers/readZip";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("@/lib/server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/db")>()),
  getDatabase: () => state.db
}));
vi.mock("@/lib/server/auth/guards", () => ({
  requireApiSession: vi.fn(async () => ({ ok: true, userId: "user_1", sessionId: "s", deviceId: "d" }))
}));

let dir: string;
let db: AppDatabase;
let fileId: string;
let projectId: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-symlink-"));
  const root = path.join(dir, "storage");
  fs.mkdirSync(path.join(root, "Projects", "shed", "Inbox"), { recursive: true });
  fs.writeFileSync(path.join(dir, "secret.sqlite"), "SECRET-DATABASE-BYTES");
  // What an SMB user can do: swap an indexed file for a link to something only the app can read.
  fs.symlinkSync(path.join(dir, "secret.sqlite"), path.join(root, "Projects", "shed", "Inbox", "plan.png"));
  process.env.NAS_CLOUD_STORAGE_ROOT = root;
  resetAppConfigForTesting();
  db = createDatabase(path.join(dir, "test.sqlite"));
  state.db = db;

  const repo = createMetadataRepository(db);
  const user = repo.createUser({ email: "owner@example.test", name: "Owner", passwordHash: "x", role: "owner" });
  const project = repo.createProject({ name: "Shed" });
  const file = repo.createFile({
    name: "plan.png",
    extension: "png",
    family: "image",
    mimeType: "image/png",
    sizeBytes: 21,
    checksum: "abc",
    storagePath: "Projects/shed/Inbox/plan.png",
    projectId: project.id,
    sourceDevice: "Browser"
  });
  repo.createFileShareLink({ fileId: file.id, tokenHash: hashShareToken("share-token"), createdByUserId: user.id });
  fileId = file.id;
  projectId = project.id;
});

afterEach(() => {
  db.close();
  delete process.env.NAS_CLOUD_STORAGE_ROOT;
  resetAppConfigForTesting();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("reads through a symlink that leaves the storage root", () => {
  it("are refused by the authenticated download", async () => {
    const { GET } = await import("@/app/api/files/[id]/download/route");

    const response = await GET(new Request(`http://localhost/api/files/${fileId}/download`), {
      params: Promise.resolve({ id: fileId })
    });

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("SECRET");
  });

  it("are refused by the share download", async () => {
    const { GET } = await import("@/app/api/shares/[token]/download/route");

    const response = await GET(new Request("http://localhost/api/shares/share-token/download"), {
      params: Promise.resolve({ token: "share-token" })
    });

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("SECRET");
  });

  it("are left out of project and bulk ZIP exports", async () => {
    const project = await import("@/app/api/projects/[id]/download/route");
    const bulk = await import("@/app/api/files/bulk/download/route");

    const responses = [
      await project.GET(new Request(`http://localhost/api/projects/${projectId}/download`), {
        params: Promise.resolve({ id: projectId })
      }),
      await bulk.GET(new Request(`http://localhost/api/files/bulk/download?fileIds=${fileId}`))
    ];

    for (const response of responses) {
      const entries = readStoredZip(new Uint8Array(await response.arrayBuffer()));
      expect([...entries.keys()]).toEqual(["_MISSING.txt"]);
      expect([...entries.values()].join("")).not.toContain("SECRET");
    }
  });

  it("are not decoded by the preview worker", async () => {
    const repo = createMetadataRepository(db);
    repo.upsertFilePreview({ fileId, kind: "image", status: "pending" });
    const [job] = repo.listPendingPreviewJobs();

    await processPreviewJob({ job, repo, storage: createStorageService() });

    expect(repo.getFilePreview(fileId, "image")).toMatchObject({
      status: "failed",
      error: expect.stringContaining("escapes configured root")
    });
  });
});
