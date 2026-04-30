import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

  it("rejects paths escaping to a sibling root with the same prefix", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
    createdDirs.push(root);
    const storage = createStorageService(root);

    const siblingPrefixEscape = `../${path.basename(root)}-evil/file.txt`;

    expect(() => storage.absolutePathFor(siblingPrefixEscape)).toThrow(
      "Storage path escapes configured root"
    );
  });
});
