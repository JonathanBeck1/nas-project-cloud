import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStorageService } from "@/lib/server/storage";

const createdDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function crossDeviceError(): NodeJS.ErrnoException {
  return Object.assign(new Error("EXDEV: cross-device link not permitted"), { code: "EXDEV" });
}

async function storeInboxFile(dir: string, contents: string) {
  const storage = createStorageService(dir);
  const stored = await storage.writeUpload({
    target: { kind: "inbox", sourceDevice: "Browser" },
    filename: "bracket.stl",
    mimeType: "model/stl",
    bytes: Buffer.from(contents)
  });
  return { storage, stored };
}

describe("storage moves across filesystems", () => {
  it("falls back to copy when the destination is on another filesystem", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-exdev-"));
    createdDirs.push(dir);
    const { storage, stored } = await storeInboxFile(dir, "incoming");
    vi.spyOn(fsPromises, "link").mockRejectedValueOnce(crossDeviceError());

    const moved = await storage.moveToProject({
      currentRelativePath: stored.relativePath,
      projectSlug: "print-parts",
      filename: "bracket.stl"
    });

    expect(moved.relativePath).toBe("Projects/print-parts/Inbox/bracket.stl");
    expect(fs.readFileSync(moved.absolutePath, "utf8")).toBe("incoming");
    expect(fs.existsSync(stored.absolutePath)).toBe(false);
    expect(fs.readdirSync(path.dirname(moved.absolutePath))).toEqual(["bracket.stl"]);
  });

  it("still suffixes instead of overwriting when falling back to copy", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-exdev-"));
    createdDirs.push(dir);
    const existingPath = path.join(dir, "Projects", "print-parts", "Inbox", "bracket.stl");
    fs.mkdirSync(path.dirname(existingPath), { recursive: true });
    fs.writeFileSync(existingPath, "existing");
    const { storage, stored } = await storeInboxFile(dir, "incoming");
    vi.spyOn(fsPromises, "link").mockRejectedValueOnce(crossDeviceError());
    const copyFile = vi.spyOn(fsPromises, "copyFile");

    const moved = await storage.moveToProject({
      currentRelativePath: stored.relativePath,
      projectSlug: "print-parts",
      filename: "bracket.stl"
    });

    expect(moved.relativePath).toBe("Projects/print-parts/Inbox/bracket-2.stl");
    expect(fs.readFileSync(existingPath, "utf8")).toBe("existing");
    expect(fs.readFileSync(moved.absolutePath, "utf8")).toBe("incoming");
    expect(fs.existsSync(stored.absolutePath)).toBe(false);
    expect(fs.readdirSync(path.dirname(existingPath)).sort()).toEqual(["bracket-2.stl", "bracket.stl"]);
    expect(copyFile).toHaveBeenCalledTimes(1);
  });

  it("leaves the source untouched when the copy fails", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-exdev-"));
    createdDirs.push(dir);
    const { storage, stored } = await storeInboxFile(dir, "incoming");
    vi.spyOn(fsPromises, "link").mockRejectedValueOnce(crossDeviceError());
    vi.spyOn(fsPromises, "copyFile").mockRejectedValueOnce(new Error("disk full"));

    await expect(
      storage.moveToProject({
        currentRelativePath: stored.relativePath,
        projectSlug: "print-parts",
        filename: "bracket.stl"
      })
    ).rejects.toThrow("disk full");

    expect(fs.readFileSync(stored.absolutePath, "utf8")).toBe("incoming");
    expect(fs.readdirSync(path.join(dir, "Projects", "print-parts", "Inbox"))).toEqual([]);
  });

  it("restores a file to its exact path across filesystems", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-exdev-"));
    createdDirs.push(dir);
    const { storage, stored } = await storeInboxFile(dir, "incoming");
    const archived = await storage.archiveFile({
      currentRelativePath: stored.relativePath,
      filename: "bracket.stl",
      now: new Date("2026-04-01T00:00:00.000Z")
    });
    vi.spyOn(fsPromises, "link").mockRejectedValueOnce(crossDeviceError());

    const restored = await storage.restoreFile({
      currentRelativePath: archived.relativePath,
      targetRelativePath: stored.relativePath
    });

    expect(fs.readFileSync(restored.absolutePath, "utf8")).toBe("incoming");
    expect(fs.existsSync(archived.absolutePath)).toBe(false);
    expect(fs.readdirSync(path.dirname(restored.absolutePath))).toEqual(["bracket.stl"]);
  });
});
