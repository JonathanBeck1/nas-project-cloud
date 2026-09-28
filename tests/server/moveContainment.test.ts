import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { processPreviewJob } from "@/lib/server/previews/worker";
import { createStorageService } from "@/lib/server/storage";

let dir: string;
let root: string;
let appdata: string;
let secret: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-containment-"));
  root = path.join(dir, "files");
  appdata = path.join(dir, "appdata");
  fs.mkdirSync(root);
  fs.mkdirSync(appdata);
  secret = path.join(appdata, "nas-cloud.sqlite");
  fs.writeFileSync(secret, "SECRET-DATABASE-BYTES");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const appdataUntouched = () => {
  expect(fs.readdirSync(appdata)).toEqual(["nas-cloud.sqlite"]);
  expect(fs.readFileSync(secret, "utf8")).toBe("SECRET-DATABASE-BYTES");
};

// An indexed file whose folder is then swapped for a symlink out of the root, as an SMB user could.
async function fileBehindSymlinkedFolder() {
  const storage = createStorageService(root);
  const stored = await storage.writeUpload({
    target: { kind: "inbox", sourceDevice: "laptop" },
    filename: "nas-cloud.sqlite",
    mimeType: "application/octet-stream",
    bytes: Buffer.from("user file")
  });
  fs.rmSync(path.join(root, "Inbox", "laptop"), { recursive: true });
  fs.symlinkSync(appdata, path.join(root, "Inbox", "laptop"));
  return { storage, relativePath: stored.relativePath };
}

describe("mutations stay inside the storage root when a folder is a symlink", () => {
  it.each([
    ["move to a project", (s: ReturnType<typeof createStorageService>, rel: string) =>
      s.moveToProject({ currentRelativePath: rel, projectSlug: "drone", filename: "nas-cloud.sqlite" })],
    ["move to the inbox", (s: ReturnType<typeof createStorageService>, rel: string) =>
      s.moveToInbox({ currentRelativePath: rel, sourceDevice: "desktop", filename: "nas-cloud.sqlite" })],
    ["rename", (s: ReturnType<typeof createStorageService>, rel: string) =>
      s.renameFile({ currentRelativePath: rel, filename: "renamed.sqlite" })],
    ["archive", (s: ReturnType<typeof createStorageService>, rel: string) =>
      s.archiveFile({ currentRelativePath: rel, filename: "nas-cloud.sqlite" })],
    ["restore", (s: ReturnType<typeof createStorageService>, rel: string) =>
      s.restoreFile({ currentRelativePath: rel, targetRelativePath: "Library/nas-cloud.sqlite" })],
    ["delete", (s: ReturnType<typeof createStorageService>, rel: string) => s.deleteFile(rel)],
    ["abort an upload", (s: ReturnType<typeof createStorageService>, rel: string) => s.abortUploadSession(rel)]
  ])("refuses to %s a file behind the symlinked folder", async (_name, operation) => {
    const { storage, relativePath } = await fileBehindSymlinkedFolder();

    await expect(operation(storage, relativePath)).rejects.toThrow("escapes configured root");

    appdataUntouched();
    expect(fs.existsSync(path.join(root, "Projects"))).toBe(false);
    expect(fs.existsSync(path.join(root, "Archive"))).toBe(false);
    expect(fs.existsSync(path.join(root, "Library"))).toBe(false);
  });

  it("refuses to move a file into a destination folder that is a symlink out of the root", async () => {
    const storage = createStorageService(root);
    const stored = await storage.writeUpload({
      target: { kind: "inbox", sourceDevice: "laptop" },
      filename: "bracket.stl",
      mimeType: "model/stl",
      bytes: Buffer.from("solid")
    });
    fs.mkdirSync(path.join(root, "Projects", "drone"), { recursive: true });
    fs.symlinkSync(appdata, path.join(root, "Projects", "drone", "Inbox"));

    await expect(
      storage.moveToProject({ currentRelativePath: stored.relativePath, projectSlug: "drone", filename: "bracket.stl" })
    ).rejects.toThrow("escapes configured root");

    appdataUntouched();
    expect(fs.readFileSync(stored.absolutePath, "utf8")).toBe("solid");
  });

  it("refuses to write an upload into a symlinked inbox or upload folder", async () => {
    const storage = createStorageService(root);
    fs.mkdirSync(path.join(root, "Inbox"));
    fs.symlinkSync(appdata, path.join(root, "Inbox", "laptop"));
    fs.symlinkSync(appdata, path.join(root, ".uploads"));

    await expect(
      storage.writeUpload({
        target: { kind: "inbox", sourceDevice: "laptop" },
        filename: "planted.txt",
        mimeType: "text/plain",
        bytes: Buffer.from("x")
      })
    ).rejects.toThrow("escapes configured root");
    await expect(storage.createUploadTempPath("upload_1")).rejects.toThrow("escapes configured root");

    appdataUntouched();
  });

  it("still allows a symlinked folder that stays inside the root", async () => {
    const storage = createStorageService(root);
    fs.mkdirSync(path.join(root, "Library", "real-drone"), { recursive: true });
    fs.mkdirSync(path.join(root, "Projects"));
    fs.symlinkSync(path.join(root, "Library", "real-drone"), path.join(root, "Projects", "drone"));
    const stored = await storage.writeUpload({
      target: { kind: "inbox", sourceDevice: "laptop" },
      filename: "bracket.stl",
      mimeType: "model/stl",
      bytes: Buffer.from("solid")
    });

    const moved = await storage.moveToProject({
      currentRelativePath: stored.relativePath,
      projectSlug: "drone",
      filename: "bracket.stl"
    });

    expect(moved.relativePath).toBe("Projects/drone/Inbox/bracket.stl");
    expect(fs.readFileSync(path.join(root, "Library", "real-drone", "Inbox", "bracket.stl"), "utf8")).toBe("solid");
  });

  it("works on a storage root that does not exist yet", async () => {
    const storage = createStorageService(path.join(dir, "fresh"));

    const stored = await storage.writeUpload({
      target: { kind: "inbox", sourceDevice: "laptop" },
      filename: "first.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("x")
    });

    expect(stored.relativePath).toBe("Inbox/laptop/first.txt");
  });

  it.each([
    ["move to a project", (s: ReturnType<typeof createStorageService>, rel: string) =>
      s.moveToProject({ currentRelativePath: rel, projectSlug: "drone", filename: "report.pdf" })],
    ["archive", (s: ReturnType<typeof createStorageService>, rel: string) =>
      s.archiveFile({ currentRelativePath: rel, filename: "report.pdf" })],
    ["restore", (s: ReturnType<typeof createStorageService>, rel: string) =>
      s.restoreFile({ currentRelativePath: rel, targetRelativePath: "Library/report.pdf" })]
  ])("refuses to %s a file that was itself swapped for a symlink", async (_name, operation) => {
    const storage = createStorageService(root);
    const stored = await storage.writeUpload({
      target: { kind: "inbox", sourceDevice: "laptop" },
      filename: "report.pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("user file")
    });
    fs.rmSync(stored.absolutePath);
    fs.symlinkSync(secret, stored.absolutePath);

    await expect(operation(storage, stored.relativePath)).rejects.toThrow("not a file");

    appdataUntouched();
    expect(fs.lstatSync(stored.absolutePath).isSymbolicLink()).toBe(true);
  });

  it("does not write a preview through a symlinked .previews folder", async () => {
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const repo = createMetadataRepository(db);
      const storage = createStorageService(root);
      fs.mkdirSync(path.join(root, "Inbox", "Mac"), { recursive: true });
      await sharp({ create: { width: 8, height: 8, channels: 3, background: "#f00" } })
        .png()
        .toFile(path.join(root, "Inbox", "Mac", "red.png"));
      const file = repo.createFile({
        name: "red.png",
        extension: "png",
        family: "image",
        mimeType: "image/png",
        sizeBytes: 1,
        checksum: "x",
        storagePath: "Inbox/Mac/red.png",
        sourceDevice: "Mac"
      });
      repo.upsertFilePreview({ fileId: file.id, kind: "image", status: "pending" });
      fs.symlinkSync(appdata, path.join(root, ".previews"));
      const [job] = repo.listPendingPreviewJobs();

      await processPreviewJob({ job, repo, storage });

      appdataUntouched();
      expect(repo.getFilePreview(file.id, "image")).toMatchObject({
        status: "failed",
        error: expect.stringContaining("escapes configured root")
      });
    } finally {
      db.close();
    }
  });
});
