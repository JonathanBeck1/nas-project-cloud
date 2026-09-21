import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { Readable } from "node:stream";
import type { CloudFile } from "@/lib/shared/types";

export async function createFileDownloadResponse(
  request: Request,
  file: Pick<CloudFile, "name" | "mimeType" | "storagePath" | "checksum">,
  absolutePath: string,
  options: { cacheControl?: string } = {}
): Promise<Response | null> {
  let size: number;
  let modifiedAt: Date;

  try {
    const details = await stat(absolutePath);
    if (!details.isFile()) {
      return null;
    }
    size = details.size;
    modifiedAt = details.mtime;
  } catch {
    return null;
  }

  // Size and mtime are part of the tag because an in-place edit over SMB leaves the stored checksum stale.
  const etag = `"${file.checksum}-${size.toString(16)}-${Math.floor(modifiedAt.getTime() / 1000).toString(16)}"`;
  const lastModified = modifiedAt.toUTCString();
  const headers: Record<string, string> = {
    "content-type": safeMimeType(file.mimeType),
    "content-disposition": contentDispositionFor(file.name),
    "accept-ranges": "bytes",
    etag,
    "last-modified": lastModified,
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "same-origin",
    "content-security-policy": "default-src 'none'; sandbox"
  };

  if (options.cacheControl) {
    headers["cache-control"] = options.cacheControl;
  }

  const ifRange = request.headers.get("if-range");
  const range = !ifRange || ifRange === etag || ifRange === lastModified ? parseRange(request.headers.get("range"), size) : null;

  if (range === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${size}` } });
  }

  if (range) {
    const stream = Readable.toWeb(createReadStream(absolutePath, { start: range.start, end: range.end }));
    return new Response(stream as ReadableStream<Uint8Array>, {
      status: 206,
      headers: {
        ...headers,
        "content-length": String(range.end - range.start + 1),
        "content-range": `bytes ${range.start}-${range.end}/${size}`
      }
    });
  }

  const stream = Readable.toWeb(createReadStream(absolutePath));
  return new Response(stream as ReadableStream<Uint8Array>, {
    headers: { ...headers, "content-length": String(size) }
  });
}

/** True when the response carries the start of the file, which is what a share link counts as a download. */
export function includesFirstByte(response: Response): boolean {
  return response.status === 200 || (response.status === 206 && /^bytes 0-/.test(response.headers.get("content-range") ?? ""));
}

// Single ranges only. Anything malformed or multi-range is ignored, which RFC 9110 allows, and served as a full 200.
function parseRange(header: string | null, size: number): { start: number; end: number } | "unsatisfiable" | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  if (!match || (match[1] === "" && match[2] === "")) {
    return null;
  }

  if (match[1] === "") {
    const suffix = Number(match[2]);
    return suffix === 0 || size === 0 ? "unsatisfiable" : { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(match[1]);
  const end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  if (match[2] !== "" && Number(match[2]) < start) {
    return null;
  }
  return start >= size ? "unsatisfiable" : { start, end };
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
