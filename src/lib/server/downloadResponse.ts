import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { Readable } from "node:stream";
import type { CloudFile } from "@/lib/shared/types";

export async function createFileDownloadResponse(
  file: Pick<CloudFile, "name" | "mimeType" | "storagePath">,
  absolutePath: string,
  options: { cacheControl?: string } = {}
): Promise<Response | null> {
  let size: number;

  try {
    const details = await stat(absolutePath);
    if (!details.isFile()) {
      return null;
    }
    size = details.size;
  } catch {
    return null;
  }

  const headers: Record<string, string> = {
    "content-type": safeMimeType(file.mimeType),
    "content-length": String(size),
    "content-disposition": contentDispositionFor(file.name),
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "same-origin",
    "content-security-policy": "default-src 'none'; sandbox"
  };

  if (options.cacheControl) {
    headers["cache-control"] = options.cacheControl;
  }

  const stream = Readable.toWeb(createReadStream(absolutePath));
  return new Response(stream as ReadableStream<Uint8Array>, { headers });
}

function safeDownloadFilename(name: string): string {
  const filename = safeFilenameBase(name).replace(/[^\x20-\x7E]/g, "_").trim();
  return filename && filename !== "." && filename !== ".." ? filename : "download.bin";
}

function contentDispositionFor(name: string): string {
  const fallback = safeDownloadFilename(name);
  const utf8Filename = safeFilenameBase(name).trim();
  const encodedFilename = utf8Filename && utf8Filename !== "." && utf8Filename !== ".."
    ? encodeURIComponent(utf8Filename)
    : encodeURIComponent("download.bin");

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodedFilename}`;
}

function safeFilenameBase(name: string): string {
  return basename(name).replace(/["\\\x00-\x1F\x7F]/g, "_");
}

function safeMimeType(mimeType: string | null | undefined): string {
  const value = mimeType?.trim() ?? "";
  if (/^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/.test(value)) {
    return value;
  }

  return "application/octet-stream";
}
