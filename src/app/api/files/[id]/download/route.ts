import { NextResponse } from "next/server";
import { fileTarget, recordAudit } from "@/lib/server/audit";
import { fileDenied } from "@/lib/server/auth/access";
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

  const denied = fileDenied(repo, auth, file, "view");
  if (denied) {
    return denied;
  }

  const absolutePath = await createStorageService()
    .resolveReadPath(file.storagePath)
    .catch(() => null);
  const response = absolutePath ? await createFileDownloadResponse(request, file, absolutePath) : null;
  // A player seeking through a video asks for later byte ranges; only the start of a download is an entry.
  const range = request.headers.get("range");
  if (response?.ok && (!range || range.startsWith("bytes=0-"))) {
    recordAudit(request, { userId: auth.userId, action: "file_downloaded", target: fileTarget(file) });
  }

  return response ?? NextResponse.json({ error: "file not found" }, { status: 404 });
}
