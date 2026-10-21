import path from "node:path";
import { NextResponse } from "next/server";
import { fileTarget, recordAudit } from "@/lib/server/audit";
import { fileDenied } from "@/lib/server/auth/access";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const repo = createMetadataRepository(getDatabase());
  const file = repo.getFileById(id);

  if (!file || file.status === "active") {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const denied = fileDenied(repo, auth, file, "edit");
  if (denied) {
    return denied;
  }

  const storage = createStorageService();
  // A missing file is already gone from disk; only its record and thumbnail are left to remove.
  if (file.status === "archived") {
    try {
      await storage.deleteFile(file.storagePath);
    } catch {
      return NextResponse.json({ error: "file not found" }, { status: 404 });
    }
  }
  // The thumbnail is a copy of the file's content. The hourly sweep retries it if this fails.
  await storage.deleteFile(path.posix.join(".previews", "images", `${file.id}.webp`)).catch(() => undefined);

  try {
    if (!repo.deleteFile(id)) {
      return NextResponse.json({ error: "file not found" }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: "file operation requires manual repair" }, { status: 500 });
  }
  recordAudit(request, {
    userId: auth.userId,
    action: "file_deleted",
    target: fileTarget(file),
    detail: { path: file.storagePath }
  });
  return NextResponse.json({ ok: true });
}

