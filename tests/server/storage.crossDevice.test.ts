import { execFileSync } from "node:child_process";
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

// A refused move may stop before the destination folder is created, which is just as good as leaving it empty.
const filesIn = (folder: string) => (fs.existsSync(folder) ? fs.readdirSync(folder) : []);

function crossDeviceError(): NodeJS.ErrnoException {
  return Object.assign(new Error("EXDEV: cross-device link not permitted"), { code: "EXDEV" });
}

// The cross-device fallback stages its copy in an exclusively created ".<uuid>.part" file.
function spyOnStagedCopies(failSyncWith?: Error) {
  const open = fsPromises.open.bind(fsPromises);
  const staged: string[] = [];
  vi.spyOn(fsPromises, "open").mockImplementation(async (...args: Parameters<typeof fsPromises.open>) => {
    const handle = await open(...args);
    if (String(args[0]).endsWith(".part") && args[1] === "wx") {
      staged.push(String(args[0]));
      if (failSyncWith) {
        handle.sync = async () => {
          throw failSyncWith;
        };
      }
    }
    return handle;
  });
  return staged;
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
    const staged = spyOnStagedCopies();

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
    expect(staged).toHaveLength(1);
  });

  it("leaves the source untouched when the copy fails", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-exdev-"));
    createdDirs.push(dir);
    const { storage, stored } = await storeInboxFile(dir, "incoming");
    vi.spyOn(fsPromises, "link").mockRejectedValueOnce(crossDeviceError());
    spyOnStagedCopies(new Error("disk full"));

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

  it("moves across filesystems where fs.copyFile would be refused", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-exdev-"));
    createdDirs.push(dir);
    const { storage, stored } = await storeInboxFile(dir, "incoming");
    vi.spyOn(fsPromises, "link").mockRejectedValueOnce(crossDeviceError());
    // What libuv's copyfile gets back from fchmod on a restricted-ACL ZFS dataset.
    vi.spyOn(fsPromises, "copyFile").mockRejectedValue(
      Object.assign(new Error("EPERM: operation not permitted, copyfile"), { code: "EPERM" })
    );

    const moved = await storage.moveToProject({
      currentRelativePath: stored.relativePath,
      projectSlug: "print-parts",
      filename: "bracket.stl"
    });

    expect(fs.readFileSync(moved.absolutePath, "utf8")).toBe("incoming");
    expect(fs.existsSync(stored.absolutePath)).toBe(false);
    expect(fs.readdirSync(path.dirname(moved.absolutePath))).toEqual(["bracket.stl"]);
  });

  it("refuses to copy a symlink that replaced the source", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-exdev-"));
    createdDirs.push(dir);
    const secret = path.join(dir, "nas-cloud.sqlite");
    fs.writeFileSync(secret, "SECRET-DATABASE-BYTES");
    const { storage, stored } = await storeInboxFile(dir, "incoming");
    fs.rmSync(stored.absolutePath);
    fs.symlinkSync(secret, stored.absolutePath);
    vi.spyOn(fsPromises, "link").mockRejectedValueOnce(crossDeviceError());

    await expect(
      storage.moveToProject({
        currentRelativePath: stored.relativePath,
        projectSlug: "print-parts",
        filename: "bracket.stl"
      })
    ).rejects.toThrow();

    expect(filesIn(path.join(dir, "Projects", "print-parts", "Inbox"))).toEqual([]);
    expect(fs.lstatSync(stored.absolutePath).isSymbolicLink()).toBe(true);
  });

  it("refuses a FIFO that replaced the source instead of blocking on it", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-exdev-"));
    createdDirs.push(dir);
    const { storage, stored } = await storeInboxFile(dir, "incoming");
    fs.rmSync(stored.absolutePath);
    execFileSync("mkfifo", [stored.absolutePath]);
    vi.spyOn(fsPromises, "link").mockRejectedValueOnce(crossDeviceError());

    await expect(
      storage.moveToProject({
        currentRelativePath: stored.relativePath,
        projectSlug: "print-parts",
        filename: "bracket.stl"
      })
    ).rejects.toThrow("not a file");

    expect(filesIn(path.join(dir, "Projects", "print-parts", "Inbox"))).toEqual([]);
  }, 2_000);

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
