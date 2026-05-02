import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const repo = createMetadataRepository(getDatabase());
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

  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0) {
    return NextResponse.json({ error: "chunk is required" }, { status: 400 });
  }
  if (offset + bytes.length > session.sizeBytes) {
    return NextResponse.json({ error: "chunk exceeds declared upload size" }, { status: 413 });
  }

  const storage = createStorageService();
  const appended = await storage.appendUploadChunk({
    tempRelativePath: session.tempPath,
    offset,
    bytes
  });
  const advanced = repo.advanceUploadSession(id, {
    expectedReceivedBytes: offset,
    receivedBytes: appended.receivedBytes
  });

  if (!advanced) {
    return NextResponse.json({ error: "upload session changed during chunk write" }, { status: 409 });
  }

  return NextResponse.json({ session: advanced });
}
