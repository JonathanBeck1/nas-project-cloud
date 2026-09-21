import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { createStorageService } from "@/lib/server/storage";

const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("storage service", () => {
  it("writes inbox files under the source device", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(root);
    const storage = createStorageService(root);

    const result = await storage.writeUpload({
      target: { kind: "inbox", sourceDevice: "Windows-PC" },
      filename: "part.stl",
      mimeType: "model/stl",
      bytes: Buffer.from("solid data")
    });

    expect(result.relativePath).toBe("Inbox/Windows-PC/part.stl");
    expect(fs.existsSync(result.absolutePath)).toBe(true);
    expect(result.sizeBytes).toBe(10);
  });

  it("neutralizes dot-dot inbox source device segments", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(root);
    const storage = createStorageService(root);

    const result = await storage.writeUpload({
      target: { kind: "inbox", sourceDevice: ".." },
      filename: "part.stl",
      mimeType: "model/stl",
      bytes: Buffer.from("solid data")
    });

    expect(result.relativePath).toBe("Inbox/unknown-device/part.stl");
    expect(path.dirname(result.absolutePath)).toBe(path.join(root, "Inbox", "unknown-device"));
    expect(fs.existsSync(path.join(root, "part.stl"))).toBe(false);
  });

  it("neutralizes dot-dot project slug segments", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(root);
    const storage = createStorageService(root);

    const result = await storage.writeUpload({
      target: { kind: "project", projectSlug: ".." },
      filename: "part.stl",
      mimeType: "model/stl",
      bytes: Buffer.from("solid data")
    });

    expect(result.relativePath).toBe("Projects/unknown-device/Inbox/part.stl");
    expect(path.dirname(result.absolutePath)).toBe(
      path.join(root, "Projects", "unknown-device", "Inbox")
    );
    expect(fs.existsSync(path.join(root, "Inbox", "part.stl"))).toBe(false);
  });

  it("deduplicates filenames without overwriting existing files", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(root);
    const storage = createStorageService(root);

    await storage.writeUpload({
      target: { kind: "project", projectSlug: "print-parts" },
      filename: "plate.png",
      mimeType: "image/png",
      bytes: Buffer.from("first")
    });

    const second = await storage.writeUpload({
      target: { kind: "project", projectSlug: "print-parts" },
      filename: "plate.png",
      mimeType: "image/png",
      bytes: Buffer.from("second")
    });

    expect(second.relativePath).toBe("Projects/print-parts/Inbox/plate-2.png");
    expect(fs.readFileSync(second.absolutePath, "utf8")).toBe("second");
  });

  it("returns file stats for a stored relative path", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(dir);
    const storage = createStorageService(dir);
    const stored = await storage.writeUpload({
      target: { kind: "inbox", sourceDevice: "Browser" },
      filename: "manual.pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("manual")
    });

    const details = await storage.fileDetails(stored.relativePath);

    expect(details.sizeBytes).toBe(6);
    expect(path.isAbsolute(details.absolutePath)).toBe(true);
    expect(details.absolutePath.endsWith("manual.pdf")).toBe(true);
  });

  it("returns file stats when the method is destructured", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(dir);
    const storage = createStorageService(dir);
    const stored = await storage.writeUpload({
      target: { kind: "inbox", sourceDevice: "Browser" },
      filename: "manual.pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("manual")
    });
    const { fileDetails } = storage;

    const details = await fileDetails(stored.relativePath);

    expect(details.sizeBytes).toBe(6);
  });

  it("moves files into a project and archive without leaving storage root", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(dir);
    const storage = createStorageService(dir);
    const stored = await storage.writeUpload({
      target: { kind: "inbox", sourceDevice: "Browser" },
      filename: "bracket.stl",
      mimeType: "model/stl",
      bytes: Buffer.from("model")
    });

    const moved = await storage.moveToProject({
      currentRelativePath: stored.relativePath,
      projectSlug: "print-parts",
      filename: "bracket.stl"
    });
    expect(moved.relativePath).toBe("Projects/print-parts/Inbox/bracket.stl");
    expect(fs.existsSync(path.join(dir, moved.relativePath))).toBe(true);

    const archived = await storage.archiveFile({
      currentRelativePath: moved.relativePath,
      filename: "bracket.stl",
      now: new Date("2026-04-30T00:00:00.000Z")
    });
    expect(archived.relativePath).toBe("Archive/2026/04/bracket.stl");
    expect(fs.existsSync(path.join(dir, archived.relativePath))).toBe(true);
  });

  it("moves files to the next suffix without overwriting an existing destination", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(dir);
    const storage = createStorageService(dir);
    const existingPath = path.join(dir, "Projects", "print-parts", "Inbox", "bracket.stl");
    fs.mkdirSync(path.dirname(existingPath), { recursive: true });
    fs.writeFileSync(existingPath, "existing");
    const stored = await storage.writeUpload({
      target: { kind: "inbox", sourceDevice: "Browser" },
      filename: "bracket.stl",
      mimeType: "model/stl",
      bytes: Buffer.from("incoming")
    });
    const originalSourcePath = stored.absolutePath;
    const { moveToProject } = storage;

    const moved = await moveToProject({
      currentRelativePath: stored.relativePath,
      projectSlug: "print-parts",
      filename: "bracket.stl"
    });

    expect(moved.relativePath).toBe("Projects/print-parts/Inbox/bracket-2.stl");
    expect(fs.readFileSync(existingPath, "utf8")).toBe("existing");
    expect(fs.readFileSync(path.join(dir, moved.relativePath), "utf8")).toBe("incoming");
    expect(fs.existsSync(originalSourcePath)).toBe(false);
  });

  it("renames a file in place without overwriting an existing destination", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(dir);
    const storage = createStorageService(dir);
    const existingPath = path.join(dir, "Inbox", "Browser", "bracket-final.stl");
    fs.mkdirSync(path.dirname(existingPath), { recursive: true });
    fs.writeFileSync(existingPath, "existing");
    const stored = await storage.writeUpload({
      target: { kind: "inbox", sourceDevice: "Browser" },
      filename: "bracket.stl",
      mimeType: "model/stl",
      bytes: Buffer.from("incoming")
    });

    const renamed = await storage.renameFile({
      currentRelativePath: stored.relativePath,
      filename: "bracket-final.stl"
    });

    expect(renamed.relativePath).toBe("Inbox/Browser/bracket-final-2.stl");
    expect(fs.readFileSync(existingPath, "utf8")).toBe("existing");
    expect(fs.readFileSync(path.join(dir, renamed.relativePath), "utf8")).toBe("incoming");
    expect(fs.existsSync(path.join(dir, stored.relativePath))).toBe(false);
  });

  it("restores a moved file to its original relative path", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(dir);
    const storage = createStorageService(dir);
    const stored = await storage.writeUpload({
      target: { kind: "inbox", sourceDevice: "Browser" },
      filename: "bracket.stl",
      mimeType: "model/stl",
      bytes: Buffer.from("model")
    });
    const moved = await storage.moveToProject({
      currentRelativePath: stored.relativePath,
      projectSlug: "print-parts",
      filename: "bracket.stl"
    });

    const restored = await storage.restoreFile({
      currentRelativePath: moved.relativePath,
      targetRelativePath: stored.relativePath
    });

    expect(restored.relativePath).toBe(stored.relativePath);
    expect(fs.readFileSync(path.join(dir, stored.relativePath), "utf8")).toBe("model");
    expect(fs.existsSync(path.join(dir, moved.relativePath))).toBe(false);
  });

  it("deletes a stored relative file without escaping the storage root", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(dir);
    const storage = createStorageService(dir);
    const stored = await storage.writeUpload({
      target: { kind: "inbox", sourceDevice: "Browser" },
      filename: "manual.pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("manual")
    });

    await storage.deleteFile(stored.relativePath);

    expect(fs.existsSync(path.join(dir, stored.relativePath))).toBe(false);
    await expect(storage.deleteFile(`../${path.basename(dir)}-evil/manual.pdf`)).rejects.toThrow(
      "Storage path escapes configured root"
    );
  });

  it("appends upload chunks at exact offsets and completes the session into inbox storage", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(dir);
    const storage = createStorageService(dir);
    const temp = await storage.createUploadTempPath("upload_123");

    await storage.appendUploadChunk({
      tempRelativePath: temp.relativePath,
      offset: 0,
      bytes: Buffer.from("hello ")
    });
    const appended = await storage.appendUploadChunk({
      tempRelativePath: temp.relativePath,
      offset: 6,
      bytes: Buffer.from("world")
    });

    expect(appended.receivedBytes).toBe(11);
    await expect(
      storage.appendUploadChunk({
        tempRelativePath: temp.relativePath,
        offset: 12,
        bytes: Buffer.from("bad")
      })
    ).rejects.toMatchObject({ message: "Upload chunk offset mismatch", code: "UPLOAD_OFFSET_MISMATCH" });

    const completed = await storage.completeUploadSession({
      tempRelativePath: temp.relativePath,
      target: { kind: "inbox", sourceDevice: "Browser" },
      filename: "movie.webm",
      mimeType: "video/webm",
      sizeBytes: 11
    });

    expect(completed.relativePath).toBe("Inbox/Browser/movie.webm");
    expect(completed.sizeBytes).toBe(11);
    expect(completed.mimeType).toBe("video/webm");
    expect(fs.readFileSync(path.join(dir, completed.relativePath), "utf8")).toBe("hello world");
    expect(fs.existsSync(path.join(dir, temp.relativePath))).toBe(false);
  });

  it("keeps the temp file intact when the same chunk arrives twice at once", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(dir);
    const storage = createStorageService(dir);
    const temp = await storage.createUploadTempPath("upload_race");
    const chunk = Buffer.alloc(1024 * 1024, 7);

    await Promise.allSettled([
      storage.appendUploadChunk({ tempRelativePath: temp.relativePath, offset: 0, bytes: chunk }),
      storage.appendUploadChunk({ tempRelativePath: temp.relativePath, offset: 0, bytes: chunk })
    ]);

    expect(fs.readFileSync(temp.absolutePath).equals(chunk)).toBe(true);
  });

  it("rewrites a resent chunk in place", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(dir);
    const storage = createStorageService(dir);
    const temp = await storage.createUploadTempPath("upload_resend");
    await storage.appendUploadChunk({ tempRelativePath: temp.relativePath, offset: 0, bytes: Buffer.from("hello ") });
    await storage.appendUploadChunk({ tempRelativePath: temp.relativePath, offset: 6, bytes: Buffer.from("world") });

    const resent = await storage.appendUploadChunk({
      tempRelativePath: temp.relativePath,
      offset: 6,
      bytes: Buffer.from("world")
    });

    expect(resent.receivedBytes).toBe(11);
    expect(fs.readFileSync(temp.absolutePath, "utf8")).toBe("hello world");
  });

  it("refuses to complete an upload whose temp file is the wrong size", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(dir);
    const storage = createStorageService(dir);
    const temp = await storage.createUploadTempPath("upload_short");
    await storage.appendUploadChunk({ tempRelativePath: temp.relativePath, offset: 0, bytes: Buffer.from("hello") });

    await expect(
      storage.completeUploadSession({
        tempRelativePath: temp.relativePath,
        target: { kind: "inbox", sourceDevice: "Browser" },
        filename: "movie.webm",
        mimeType: "video/webm",
        sizeBytes: 11
      })
    ).rejects.toMatchObject({ code: "UPLOAD_SIZE_MISMATCH" });

    expect(fs.existsSync(temp.absolutePath)).toBe(true);
    expect(fs.existsSync(path.join(dir, "Inbox", "Browser", "movie.webm"))).toBe(false);
  });

  it("aborts temp upload files without allowing path escape", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(dir);
    const storage = createStorageService(dir);
    const temp = await storage.createUploadTempPath("upload_456");
    await storage.appendUploadChunk({
      tempRelativePath: temp.relativePath,
      offset: 0,
      bytes: Buffer.from("partial")
    });

    await storage.abortUploadSession(temp.relativePath);

    expect(fs.existsSync(path.join(dir, temp.relativePath))).toBe(false);
    await expect(storage.abortUploadSession("../escape.part")).rejects.toThrow("Storage path escapes configured root");
  });

  it("rejects paths escaping to a sibling root with the same prefix", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(root);
    const storage = createStorageService(root);

    const siblingPrefixEscape = `../${path.basename(root)}-evil/file.txt`;

    expect(() => storage.absolutePathFor(siblingPrefixEscape)).toThrow(
      "Storage path escapes configured root"
    );
  });

  it("refuses to read through a symlink that leaves the storage root", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(dir);
    const root = path.join(dir, "root");
    const secret = path.join(dir, "secret.txt");
    fs.writeFileSync(secret, "outside-root");
    fs.mkdirSync(path.join(root, "Inbox", "dev"), { recursive: true });
    fs.mkdirSync(path.join(dir, "outside-dir"));
    fs.writeFileSync(path.join(dir, "outside-dir", "note.txt"), "outside-root");
    fs.symlinkSync(secret, path.join(root, "Inbox", "dev", "link.txt"));
    fs.symlinkSync(path.join(dir, "outside-dir"), path.join(root, "Inbox", "linked-dir"));
    const storage = createStorageService(root);

    await expect(storage.fileDetails("Inbox/dev/link.txt")).rejects.toThrow("escapes configured root");
    await expect(storage.resolveReadPath("Inbox/dev/link.txt")).rejects.toThrow("escapes configured root");
    await expect(storage.resolveReadPath("Inbox/linked-dir/note.txt")).rejects.toThrow("escapes configured root");
  });

  it("reads through a symlink that stays inside the storage root", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(dir);
    fs.mkdirSync(path.join(dir, "Inbox", "dev"), { recursive: true });
    fs.writeFileSync(path.join(dir, "Inbox", "dev", "real.txt"), "inside");
    fs.symlinkSync(path.join(dir, "Inbox", "dev", "real.txt"), path.join(dir, "Inbox", "dev", "alias.txt"));
    const storage = createStorageService(dir);

    const resolved = await storage.resolveReadPath("Inbox/dev/alias.txt");

    expect(fs.readFileSync(resolved, "utf8")).toBe("inside");
    expect(path.basename(resolved)).toBe("real.txt");
  });

  it("accepts names that merely start with two dots", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(dir);
    const storage = createStorageService(dir);

    expect(storage.absolutePathFor("..notes.txt")).toBe(path.join(dir, "..notes.txt"));
    expect(storage.absolutePathFor("Inbox/..hidden/file.txt")).toBe(path.join(dir, "Inbox", "..hidden", "file.txt"));
    expect(() => storage.absolutePathFor("../outside.txt")).toThrow("escapes configured root");
    expect(() => storage.absolutePathFor("..")).toThrow("escapes configured root");
  });

  it("streamUpload pipes the body to a temp file and moves it into the target", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(root);
    const storage = createStorageService(root);

    const stored = await storage.streamUpload({
      target: { kind: "inbox", sourceDevice: "Windows-PC" },
      filename: "stream.bin",
      mimeType: "application/octet-stream",
      body: Readable.from(Buffer.from("hello stream")),
      maxBytes: 1024
    });

    expect(stored.relativePath).toBe("Inbox/Windows-PC/stream.bin");
    expect(stored.sizeBytes).toBe(12);
    expect(stored.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(fs.readFileSync(path.join(root, stored.relativePath), "utf8")).toBe("hello stream");
    expect(fs.existsSync(path.join(root, ".uploads"))).toBe(true);
    expect(fs.readdirSync(path.join(root, ".uploads"))).toHaveLength(0);
  });

  it("streamUpload preserves sanitized folder-relative directories", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(root);
    const storage = createStorageService(root);

    const stored = await storage.streamUpload({
      target: { kind: "inbox", sourceDevice: "Mac" },
      filename: "render.png",
      relativePath: "Client A/../Textures/render.png",
      mimeType: "image/png",
      body: Readable.from(Buffer.from("image")),
      maxBytes: 1024
    });

    expect(stored.relativePath).toBe("Inbox/Mac/Client A/Textures/render.png");
    expect(fs.readFileSync(path.join(root, stored.relativePath), "utf8")).toBe("image");
  });

  it("completeUploadSession preserves sanitized folder-relative directories", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(root);
    const storage = createStorageService(root);
    const temp = await storage.createUploadTempPath("upload_folder_path");
    fs.writeFileSync(temp.absolutePath, "movie");

    const stored = await storage.completeUploadSession({
      tempRelativePath: temp.relativePath,
      target: { kind: "project", projectSlug: "Garden Shed" },
      filename: "movie.webm",
      relativePath: "Shoot A/../Exports/movie.webm",
      mimeType: "video/webm",
      sizeBytes: 5
    });

    expect(stored.relativePath).toBe("Projects/Garden Shed/Inbox/Shoot A/Exports/movie.webm");
    expect(fs.readFileSync(path.join(root, stored.relativePath), "utf8")).toBe("movie");
  });

  it("streamUpload aborts and cleans up when the body exceeds maxBytes", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(root);
    const storage = createStorageService(root);

    await expect(
      storage.streamUpload({
        target: { kind: "inbox", sourceDevice: "Windows-PC" },
        filename: "too-big.bin",
        mimeType: "application/octet-stream",
        body: Readable.from(Buffer.from("0123456789")),
        maxBytes: 5
      })
    ).rejects.toThrow("upload exceeds size limit");

    expect(fs.readdirSync(path.join(root, ".uploads"))).toHaveLength(0);
    expect(fs.existsSync(path.join(root, "Inbox", "Windows-PC", "too-big.bin"))).toBe(false);
  });
});
