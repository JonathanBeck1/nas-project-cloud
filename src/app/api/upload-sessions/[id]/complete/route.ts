import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { enqueuePreviewForFile } from "@/lib/server/previews/enqueue";
import { createStorageService, type UploadTarget } from "@/lib/server/storage";
import { withUploadSessionLock } from "@/lib/server/uploadSessionLock";
import { classifyFile } from "@/lib/shared/fileTypes";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  return withUploadSessionLock(id, () => completeSession(id));
}

async function completeSession(id: string) {
  const repo = createMetadataRepository(getDatabase());
  // SECURITY: not scoped to the caller's user id. Harmless with a single owner; an IDOR if multi-user lands.
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
  let stored;
  try {
    stored = await storage.completeUploadSession({
      tempRelativePath: session.tempPath,
      target,
      filename: session.filename,
      relativePath: session.relativePath,
      mimeType: session.mimeType,
      sizeBytes: session.sizeBytes
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "UPLOAD_SIZE_MISMATCH") {
      await storage.abortUploadSession(session.tempPath).catch(() => undefined);
      repo.failUploadSession(id, "upload size mismatch");
      return NextResponse.json({ error: "upload size mismatch" }, { status: 409 });
    }
    throw error;
  }

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

  enqueuePreviewForFile(repo, file);
  const completed = repo.completeUploadSession(id, { storagePath: stored.relativePath });
  return NextResponse.json({ file, session: completed }, { status: 201 });
}
