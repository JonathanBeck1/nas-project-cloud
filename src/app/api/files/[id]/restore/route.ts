import path from "node:path";
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
  const file = repo.getFileById(id);

  if (!file || file.status !== "archived") {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const storage = createStorageService();
  const targetRelativePath = restoredRelativePath(file.id, file.name);
  let restored;
  try {
    restored = await storage.restoreFile({
      currentRelativePath: file.storagePath,
      targetRelativePath
    });
  } catch {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  let updated;
  try {
    updated = repo.updateFile(
      id,
      {
        storagePath: restored.relativePath,
        status: "active",
        archivedAt: null,
        projectId: null
      },
      { storagePath: file.storagePath, status: "archived" }
    );
  } catch {
    try {
      await storage.restoreFile({
        currentRelativePath: restored.relativePath,
        targetRelativePath: file.storagePath
      });
    } catch {
      return NextResponse.json({ error: "file operation requires manual repair" }, { status: 500 });
    }
    return NextResponse.json({ error: "file metadata update failed" }, { status: 500 });
  }

  return updated ? NextResponse.json({ file: updated }) : NextResponse.json({ error: "file not found" }, { status: 404 });
}

function restoredRelativePath(fileId: string, filename: string): string {
  const base = path.basename(filename).replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").trim() || "restored-file";
  return `Inbox/Restored/${fileId}-${base}`;
}
