import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = createMetadataRepository(getDatabase());
  const file = repo.getFileById(id);

  if (!file || file.status !== "active") {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const storage = createStorageService();
  let moved;
  try {
    moved = await storage.archiveFile({
      currentRelativePath: file.storagePath,
      filename: file.name
    });
  } catch {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const archivedAt = new Date().toISOString();
  let updated;
  try {
    updated = repo.updateFile(
      id,
      {
        storagePath: moved.relativePath,
        status: "archived",
        archivedAt
      },
      { storagePath: file.storagePath, status: "active" }
    );
  } catch {
    try {
      await rollbackMovedFile(storage, moved.relativePath, file.storagePath);
    } catch {
      return NextResponse.json({ error: "file operation requires manual repair" }, { status: 500 });
    }
    return NextResponse.json({ error: "file metadata update failed" }, { status: 500 });
  }

  if (!updated) {
    try {
      await rollbackMovedFile(storage, moved.relativePath, file.storagePath);
    } catch {
      return NextResponse.json({ error: "file operation requires manual repair" }, { status: 500 });
    }
  }

  return updated
    ? NextResponse.json({ file: updated })
    : NextResponse.json({ error: "file not found" }, { status: 404 });
}

async function rollbackMovedFile(
  storage: ReturnType<typeof createStorageService>,
  currentRelativePath: string,
  targetRelativePath: string
) {
  await storage.restoreFile({ currentRelativePath, targetRelativePath });
}
