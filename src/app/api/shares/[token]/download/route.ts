import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/server/auth/passwords";
import { getDatabase } from "@/lib/server/db";
import { createFileDownloadResponse } from "@/lib/server/downloadResponse";
import { createMetadataRepository } from "@/lib/server/metadata";
import { trustedClientIp } from "@/lib/server/rateLimit";
import { hashShareToken } from "@/lib/server/shareLinks";
import { createStorageService } from "@/lib/server/storage";
import type { FileShareLink } from "@/lib/shared/types";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return downloadSharedFile(request, params);
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const payload = await readPasswordPayload(request);
  return downloadSharedFile(request, params, payload.password);
}

async function downloadSharedFile(
  request: Request,
  params: Promise<{ token: string }>,
  password?: string
) {
  const { token } = await params;
  const repo = createMetadataRepository(getDatabase());
  const share = repo.getFileShareLinkByTokenHash(hashShareToken(token));

  if (!share || !isShareUsable(share)) {
    return NextResponse.json({ error: "share not found" }, { status: 404 });
  }

  if (share.passwordProtected) {
    if (!password) {
      return NextResponse.json({ error: "password required" }, { status: 401 });
    }

    const passwordHash = repo.getFileSharePasswordHash(share.id);
    if (!passwordHash || !(await verifyPassword(password, passwordHash))) {
      return NextResponse.json({ error: "password required" }, { status: 401 });
    }
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

  repo.recordFileShareDownload(share.id, {
    userAgent: request.headers.get("user-agent"),
    ipAddress: trustedClientIp(request)
  });
  return response;
}

async function readPasswordPayload(request: Request): Promise<{ password?: string }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const payload = (await request.json()) as { password?: unknown };
      return typeof payload.password === "string" ? { password: payload.password } : {};
    } catch {
      return {};
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    try {
      const formData = await request.formData();
      const password = formData.get("password");
      return typeof password === "string" ? { password } : {};
    } catch {
      return {};
    }
  }

  return {};
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
