import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/server/auth/passwords";
import { getDatabase } from "@/lib/server/db";
import { createFileDownloadResponse, includesFirstByte } from "@/lib/server/downloadResponse";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createRateLimiter, trustedClientIp } from "@/lib/server/rateLimit";
import { hashShareToken } from "@/lib/server/shareLinks";
import { createStorageService } from "@/lib/server/storage";
import type { FileShareLink } from "@/lib/shared/types";

const PASSWORD_ATTEMPTS_MAX = 10;
const PASSWORD_ATTEMPTS_WINDOW_MS = 15 * 60_000;

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

    // Keyed by share, not client: every guess costs a scrypt, and the share is what is being attacked.
    const attempt = createRateLimiter().consume({
      bucket: "share_password",
      key: share.id,
      max: PASSWORD_ATTEMPTS_MAX,
      windowMs: PASSWORD_ATTEMPTS_WINDOW_MS
    });
    if (!attempt.allowed) {
      return NextResponse.json(
        { error: "too many requests", retryAfterSeconds: attempt.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(Math.max(1, attempt.retryAfterSeconds)) } }
      );
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

  const absolutePath = await createStorageService()
    .resolveReadPath(file.storagePath)
    .catch(() => null);
  const response = absolutePath
    ? await createFileDownloadResponse(request, file, absolutePath, { cacheControl: "no-store" })
    : null;

  if (!response) {
    return NextResponse.json({ error: "share not found" }, { status: 404 });
  }

  // A resumed transfer is the same download, so only a response that starts the file uses one up.
  if (includesFirstByte(response)) {
    const recorded = repo.recordFileShareDownload(share.id, {
      userAgent: request.headers.get("user-agent"),
      ipAddress: trustedClientIp(request)
    });
    if (!recorded) {
      await response.body?.cancel();
      return NextResponse.json({ error: "share not found" }, { status: 404 });
    }
  }
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
