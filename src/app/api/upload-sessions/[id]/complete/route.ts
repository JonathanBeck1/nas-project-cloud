import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService, type UploadTarget } from "@/lib/server/storage";
import { classifyFile } from "@/lib/shared/fileTypes";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = createMetadataRepository(getDatabase());
  const session = repo.getUploadSession(id);
  if (!session) {
    return NextResponse.json({ error: "upload session not found" }, { status: 404 });
  }
  if (session.status !== "open") {
    return NextResponse.json({ error: "upload session is not open" }, { status: 409 });
  }
  if (session.receivedBytes !== session.sizeBytes) {
    return NextResponse.json(
      { error: "upload session is incomplete", receivedBytes: session.receivedBytes },
      { status: 409 }
    );
  }

  const target: UploadTarget =
    session.targetKind === "project" && session.projectSlug
      ? { kind: "project", projectSlug: session.projectSlug }
      : { kind: "inbox", sourceDevice: session.sourceDevice };

  const storage = createStorageService();
  const stored = await storage.completeUploadSession({
    tempRelativePath: session.tempPath,
    target,
    filename: session.filename,
    mimeType: session.mimeType
  });

  if (session.checksum && session.checksum !== stored.checksum) {
    await storage.deleteFile(stored.relativePath).catch(() => undefined);
    repo.failUploadSession(id, "upload checksum mismatch");
    return NextResponse.json({ error: "upload checksum mismatch" }, { status: 409 });
  }

  const classification = classifyFile(session.filename);
  let file;
  try {
    file = repo.createFile({
      name: session.filename,
      extension: classification.extension,
      family: classification.family,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      checksum: stored.checksum,
      storagePath: stored.relativePath,
      projectId: session.projectId,
      categoryId: session.categoryId,
      sourceDevice: session.sourceDevice
    });
  } catch {
    await storage.deleteFile(stored.relativePath).catch(() => undefined);
    repo.failUploadSession(id, "file metadata create failed");
    return NextResponse.json({ error: "file metadata create failed" }, { status: 500 });
  }

  const completed = repo.completeUploadSession(id, { storagePath: stored.relativePath });
  return NextResponse.json({ file, session: completed }, { status: 201 });
}
