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

  let moved;
  try {
    moved = await createStorageService().archiveFile({
      currentRelativePath: file.storagePath,
      filename: file.name
    });
  } catch {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const archivedAt = new Date().toISOString();
  const updated = repo.updateFile(id, {
    storagePath: moved.relativePath,
    status: "archived",
    archivedAt
  });

  return updated
    ? NextResponse.json({ file: updated })
    : NextResponse.json({ error: "file not found" }, { status: 404 });
}
