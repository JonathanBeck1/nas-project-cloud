import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStorageService } from "@/lib/server/storage";

const createdDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Records the path of every handle that gets fsynced.
async function recordSyncedPaths(): Promise<string[]> {
  const synced: string[] = [];
  const open = fsPromises.open.bind(fsPromises);
  vi.spyOn(fsPromises, "open").mockImplementation(async (...args: Parameters<typeof fsPromises.open>) => {
    const handle = await open(...args);
    const sync = handle.sync.bind(handle);
    handle.sync = async () => {
      synced.push(String(args[0]));
      return sync();
    };
    return handle;
  });
  return synced;
}

function tempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-durable-"));
  createdDirs.push(dir);
  return dir;
}

describe("upload durability", () => {
  it("syncs a chunked upload's bytes and its destination directory once, not per chunk", async () => {
    const root = tempRoot();
    const storage = createStorageService(root);
    const temp = await storage.createUploadTempPath("upload_durable");
    const synced = await recordSyncedPaths();

    await storage.appendUploadChunk({ tempRelativePath: temp.relativePath, offset: 0, bytes: Buffer.from("hello ") });
    await storage.appendUploadChunk({ tempRelativePath: temp.relativePath, offset: 6, bytes: Buffer.from("world") });
    expect(synced).toEqual([]);

    const stored = await storage.completeUploadSession({
      tempRelativePath: temp.relativePath,
      target: { kind: "inbox", sourceDevice: "Browser" },
      filename: "movie.webm",
      mimeType: "video/webm",
      sizeBytes: 11
    });

    expect(synced).toEqual([temp.absolutePath, path.dirname(stored.absolutePath)]);
  });

  it("syncs a streamed upload before and after it is moved into place", async () => {
    const root = tempRoot();
    const storage = createStorageService(root);
    const synced = await recordSyncedPaths();

    const stored = await storage.streamUpload({
      target: { kind: "inbox", sourceDevice: "Mac" },
      filename: "render.png",
      mimeType: "image/png",
      body: Readable.from(Buffer.from("image")),
      maxBytes: 1024
    });

    expect(synced).toHaveLength(2);
    expect(synced[0]).toContain(`${path.sep}.uploads${path.sep}`);
    expect(synced[1]).toBe(path.dirname(stored.absolutePath));
  });

  it("syncs a buffered upload and its directory", async () => {
    const root = tempRoot();
    const storage = createStorageService(root);
    const synced = await recordSyncedPaths();

    const stored = await storage.writeUpload({
      target: { kind: "inbox", sourceDevice: "Browser" },
      filename: "note.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("note")
    });

    expect(synced).toEqual([stored.absolutePath, path.dirname(stored.absolutePath)]);
  });
});
