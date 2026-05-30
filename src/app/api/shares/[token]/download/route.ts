import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/db";
import { createFileDownloadResponse } from "@/lib/server/downloadResponse";
import { createMetadataRepository } from "@/lib/server/metadata";
import { hashShareToken } from "@/lib/server/shareLinks";
import { createStorageService } from "@/lib/server/storage";
import type { FileShareLink } from "@/lib/shared/types";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const repo = createMetadataRepository(getDatabase());
  const share = repo.getFileShareLinkByTokenHash(hashShareToken(token));

  if (!share || !isShareUsable(share)) {
    return NextResponse.json({ error: "share not found" }, { status: 404 });
  }

  const file = repo.getFileById(share.fileId);
  if (!file || file.status !== "active") {
    return NextResponse.json({ error: "share not found" }, { status: 404 });
  }

  const storage = createStorageService();
  const response = await createFileDownloadResponse(file, storage.absolutePathFor(file.storagePath), {
    cacheControl: "no-store"
  });

  if (!response) {
    return NextResponse.json({ error: "share not found" }, { status: 404 });
  }

  repo.recordFileShareDownload(share.id);
  return response;
}

function isShareUsable(share: FileShareLink): boolean {
  if (share.revokedAt) {
    return false;
  }
  if (share.expiresAt && Date.parse(share.expiresAt) <= Date.now()) {
    return false;
  }
  if (share.maxDownloads !== null && share.downloadCount >= share.maxDownloads) {
    return false;
  }
  return true;
}
