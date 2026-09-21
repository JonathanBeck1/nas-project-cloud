import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";
import { withUploadSessionLock } from "@/lib/server/uploadSessionLock";

const MAX_CHUNK_BYTES = 32 * 1024 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  if (Number(request.headers.get("content-length")) > MAX_CHUNK_BYTES) {
    return chunkTooLarge();
  }

  const { id } = await params;
  return withUploadSessionLock(id, () => handleChunk(request, id));
}

async function handleChunk(request: Request, id: string) {
  const repo = createMetadataRepository(getDatabase());
  // SECURITY: not scoped to the caller's user id. Harmless with a single owner; an IDOR if multi-user lands.
  const session = repo.getUploadSession(id);
  if (!session) {
    return NextResponse.json({ error: "upload session not found" }, { status: 404 });
  }
  if (session.status !== "open") {
    return NextResponse.json({ error: "upload session is not open" }, { status: 409 });
  }

  const offset = Number.parseInt(request.headers.get("upload-offset") ?? "", 10);
  if (!Number.isInteger(offset) || offset < 0) {
    return NextResponse.json({ error: "upload-offset header is required" }, { status: 400 });
  }
  if (offset !== session.receivedBytes) {
    return NextResponse.json(
      { error: "upload offset mismatch", receivedBytes: session.receivedBytes },
      { status: 409 }
    );
  }

  const bytes = await readChunk(request);
  if (!bytes) {
    return chunkTooLarge();
  }
  if (bytes.length === 0) {
    return NextResponse.json({ error: "chunk is required" }, { status: 400 });
  }
  if (offset + bytes.length > session.sizeBytes) {
    return NextResponse.json({ error: "chunk exceeds declared upload size" }, { status: 413 });
  }

  const storage = createStorageService();
  let appended;
  try {
    appended = await storage.appendUploadChunk({
      tempRelativePath: session.tempPath,
      offset,
      bytes
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "UPLOAD_OFFSET_MISMATCH") {
      return NextResponse.json(
        { error: "upload offset mismatch", receivedBytes: session.receivedBytes },
        { status: 409 }
      );
    }
    throw error;
  }
  const advanced = repo.advanceUploadSession(id, {
    expectedReceivedBytes: offset,
    receivedBytes: appended.receivedBytes
  });

  if (!advanced) {
    return NextResponse.json({ error: "upload session changed during chunk write" }, { status: 409 });
  }

  return NextResponse.json({ session: advanced });
}

// A chunked-encoding request has no content-length, so the cap is enforced while reading too.
async function readChunk(request: Request): Promise<Buffer | null> {
  if (!request.body) {
    return Buffer.alloc(0);
  }

  const parts: Uint8Array[] = [];
  let total = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return Buffer.concat(parts, total);
    }
    total += value.length;
    if (total > MAX_CHUNK_BYTES) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
}

function chunkTooLarge() {
  return NextResponse.json({ error: `chunk exceeds ${MAX_CHUNK_BYTES} bytes` }, { status: 413 });
}
