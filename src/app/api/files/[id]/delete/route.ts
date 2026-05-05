import { NextResponse } from "next/server";
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

  if (!file || file.status !== "archived") {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const storage = createStorageService();
  try {
    await storage.deleteFile(file.storagePath);
  } catch {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  try {
    const deleted = repo.deleteFile(id);
    return deleted ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "file not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "file operation requires manual repair" }, { status: 500 });
  }
}
