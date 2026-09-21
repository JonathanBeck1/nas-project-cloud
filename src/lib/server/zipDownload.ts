import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import * as archiver from "archiver";
import type { CloudFile } from "@/lib/shared/types";

export type ZipDownloadFile = {
  file: Pick<CloudFile, "name">;
  absolutePath: string;
  // Folder-relative name inside the archive; defaults to the file's basename.
  entryPath?: string;
};

export function createZipDownloadResponse(files: ZipDownloadFile[], filename: string, missing: string[] = []): Response {
  const stream = createZipStream(files, missing);
  const downloadName = safeDownloadFilename(filename);

  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": contentDispositionFor(downloadName),
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "no-store"
    }
  });
}

function createZipStream(files: ZipDownloadFile[], missing: string[]): PassThrough {
  const output = new PassThrough();
  const archive = archiver.create("zip", { store: true });
  const usedNames = new Set<string>();

  archive.on("error", (error) => output.destroy(error));
  // Fires on a client disconnect too; aborting a finished archive is a no-op.
  output.on("close", () => archive.abort());
  archive.pipe(output);

  for (const { file, absolutePath, entryPath } of files) {
    // archive.file opens each source when its turn comes; a read stream per file would hold every descriptor at once.
    archive.file(absolutePath, { name: uniqueZipEntryName(entryPath ?? file.name, usedNames) });
  }
  if (missing.length > 0) {
    archive.append(missingManifest(missing), { name: uniqueZipEntryName("_MISSING.txt", usedNames) });
  }

  void archive.finalize();
  return output;
}

function contentDispositionFor(name: string): string {
  return `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function safeDownloadFilename(name: string): string {
  const base = path.basename(name).replace(/["\\\x00-\x1F\x7F]/g, "_").trim();
  return base && base !== "." && base !== ".." ? base : "download.zip";
}

function uniqueZipEntryName(name: string, usedNames: Set<string>): string {
  const safeName = safeZipEntryName(name);
  const parsed = path.posix.parse(safeName);

  for (let index = 1; index < 10_000; index += 1) {
    const candidate = index === 1 ? safeName : path.posix.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }

  throw new Error(`Could not allocate zip entry name for ${safeName}`);
}

function safeZipEntryName(name: string): string {
  const segments = name
    .split(/[\\/]+/)
    .map((segment) => segment.replace(/[\x00-\x1F\x7F]/g, "_").trim())
    .filter((segment) => segment && segment !== "." && segment !== "..");
  return segments.length > 0 ? segments.join("/") : "download.bin";
}

function missingManifest(missing: string[]): string {
  return [
    "These files are in the library index but were not found on disk, so they are not in this archive.",
    "They were probably renamed, moved, or deleted outside the app (for example over SMB).",
    "",
    ...missing,
    ""
  ].join("\n");
}
