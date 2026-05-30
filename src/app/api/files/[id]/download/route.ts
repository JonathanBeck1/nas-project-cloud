import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createFileDownloadResponse } from "@/lib/server/downloadResponse";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const repo = createMetadataRepository(getDatabase());
  const file = repo.getFileById(id);

  if (!file || file.status !== "active") {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const storage = createStorageService();
  const response = await createFileDownloadResponse(file, storage.absolutePathFor(file.storagePath));

  return response ?? NextResponse.json({ error: "file not found" }, { status: 404 });
}
