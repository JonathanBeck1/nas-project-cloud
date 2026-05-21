import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const repo = createMetadataRepository(getDatabase());
  const file = repo.getFileById(id);

  if (!file || file.status !== "active") {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const storage = createStorageService();
  let absolutePath: string;
  let size: number;

  try {
    absolutePath = storage.absolutePathFor(file.storagePath);
    const details = await stat(absolutePath);
    if (!details.isFile()) {
      return NextResponse.json({ error: "file not found" }, { status: 404 });
    }
    size = details.size;
  } catch {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(absolutePath));
  return new Response(stream as ReadableStream<Uint8Array>, {
    headers: {
      "content-type": safeMimeType(file.mimeType),
      "content-length": String(size),
      "content-disposition": contentDispositionFor(file.name),
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin",
      "content-security-policy": "default-src 'none'; sandbox"
    }
  });
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
