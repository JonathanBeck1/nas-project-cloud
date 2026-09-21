import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createZipDownloadResponse } from "@/lib/server/zipDownload";
import { readStoredZip } from "../helpers/readZip";

const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempFile(name: string, contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-zip-"));
  createdDirs.push(dir);
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, contents);
  return filePath;
}

const openDescriptors = () => fs.readdirSync("/dev/fd").length;
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

async function unzip(response: Response) {
  return readStoredZip(new Uint8Array(await response.arrayBuffer()));
}

describe("createZipDownloadResponse", () => {
  it("keeps folder paths in entry names and neutralizes unsafe ones", async () => {
    const entries = await unzip(
      createZipDownloadResponse(
        [
          { file: { name: "movie.webm" }, entryPath: "Shoot A/Exports/movie.webm", absolutePath: tempFile("a", "one") },
          { file: { name: "movie.webm" }, entryPath: "Shoot A/Exports/movie.webm", absolutePath: tempFile("b", "two") },
          { file: { name: "evil.txt" }, entryPath: "/abs/../../evil.txt", absolutePath: tempFile("c", "three") },
          { file: { name: "plain.txt" }, absolutePath: tempFile("d", "four") }
        ],
        "export.zip"
      )
    );

    expect(Object.fromEntries(entries)).toEqual({
      "Shoot A/Exports/movie.webm": "one",
      "Shoot A/Exports/movie-2.webm": "two",
      "abs/evil.txt": "three",
      "plain.txt": "four"
    });
  });

  it("lists skipped files in a _MISSING.txt manifest", async () => {
    const entries = await unzip(
      createZipDownloadResponse([{ file: { name: "kept.txt" }, absolutePath: tempFile("kept", "kept") }], "export.zip", [
        "Shoot A/gone.stl",
        "also-gone.txt"
      ])
    );

    expect([...entries.keys()].sort()).toEqual(["_MISSING.txt", "kept.txt"]);
    expect(entries.get("_MISSING.txt")).toContain("Shoot A/gone.stl\nalso-gone.txt");
  });

  it("opens source files lazily instead of all at once", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-zip-"));
    createdDirs.push(dir);
    // Large enough that the unread response backpressures, so whatever was opened up front stays open.
    const contents = Buffer.alloc(64 * 1024, 1);
    const files = Array.from({ length: 300 }, (_, index) => {
      const absolutePath = path.join(dir, `file-${index}.bin`);
      fs.writeFileSync(absolutePath, contents);
      return { file: { name: `file-${index}.bin` }, absolutePath };
    });
    const before = openDescriptors();

    const response = createZipDownloadResponse(files, "export.zip");
    await settle();
    const held = openDescriptors() - before;
    const entries = await unzip(response);

    expect(held).toBeLessThan(10);
    expect(entries.size).toBe(300);
  });

  it("releases source files when the client goes away", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-zip-"));
    createdDirs.push(dir);
    const files = Array.from({ length: 100 }, (_, index) => {
      const absolutePath = path.join(dir, `file-${index}.bin`);
      fs.writeFileSync(absolutePath, Buffer.alloc(256 * 1024, index));
      return { file: { name: `file-${index}.bin` }, absolutePath };
    });
    const before = openDescriptors();

    const reader = createZipDownloadResponse(files, "export.zip").body!.getReader();
    await reader.read();
    await reader.cancel();
    await settle();

    expect(openDescriptors() - before).toBeLessThan(5);
  });
});
