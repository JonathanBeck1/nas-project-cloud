import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
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

  if (!file || file.status !== "active" || file.preview?.status !== "ready" || !file.preview.previewPath) {
    return NextResponse.json({ error: "preview not found" }, { status: 404 });
  }

  const storage = createStorageService();
  let absolutePath: string;
  let size: number;

  try {
    absolutePath = storage.absolutePathFor(file.preview.previewPath);
    const details = await stat(absolutePath);
    if (!details.isFile()) {
      return NextResponse.json({ error: "preview not found" }, { status: 404 });
    }
    size = details.size;
  } catch {
    return NextResponse.json({ error: "preview not found" }, { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(absolutePath));
  return new Response(stream as ReadableStream<Uint8Array>, {
    headers: {
      "content-type": previewMimeType(file.preview.previewPath),
      "content-length": String(size),
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin"
    }
  });
}

function previewMimeType(previewPath: string): string {
  switch (extname(previewPath).toLowerCase()) {
    case ".webp":
      return "image/webp";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}
