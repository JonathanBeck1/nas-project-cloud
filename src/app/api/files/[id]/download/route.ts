import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
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
      "content-type": file.mimeType || "application/octet-stream",
      "content-length": String(size),
      "content-disposition": `attachment; filename="${encodeFilename(basename(file.name))}"`
    }
  });
}

function encodeFilename(filename: string): string {
  return filename.replace(/["\\]/g, "_");
}
