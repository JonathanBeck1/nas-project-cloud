import { createReadStream } from "node:fs";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import * as archiver from "archiver";
import type { CloudFile } from "@/lib/shared/types";

export type ZipDownloadFile = {
  file: Pick<CloudFile, "name">;
  absolutePath: string;
};

export function createZipDownloadResponse(files: ZipDownloadFile[], filename: string): Response {
  const stream = createZipStream(files);
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

function createZipStream(files: ZipDownloadFile[]): PassThrough {
  const output = new PassThrough();
  const archive = archiver.create("zip", { store: true });
  const usedNames = new Set<string>();

  archive.on("error", (error) => output.destroy(error));
  archive.pipe(output);

  for (const { file, absolutePath } of files) {
    archive.append(createReadStream(absolutePath), { name: uniqueZipEntryName(file.name, usedNames) });
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
  const parsed = path.parse(safeName);

  for (let index = 1; index < 10_000; index += 1) {
    const candidate = index === 1 ? safeName : `${parsed.name}-${index}${parsed.ext}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }

  throw new Error(`Could not allocate zip entry name for ${safeName}`);
}

function safeZipEntryName(name: string): string {
  const base = path.basename(name).replace(/[\x00-\x1F\x7F]/g, "_").trim();
  return base && base !== "." && base !== ".." ? base : "download.bin";
}
