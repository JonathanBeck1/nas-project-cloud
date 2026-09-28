import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/server/auth/passwords";
import { getDatabase } from "@/lib/server/db";
import { createFileDownloadResponse, includesFirstByte } from "@/lib/server/downloadResponse";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createRateLimiter, trustedClientIp } from "@/lib/server/rateLimit";
import { hashShareToken } from "@/lib/server/shareLinks";
import { createStorageService } from "@/lib/server/storage";
import type { FileShareLink } from "@/lib/shared/types";
import { SMALL_BODY_MAX_BYTES, bodyTooLarge, parseJsonObject, readLimitedBody } from "@/lib/server/requestBody";

const PASSWORD_ATTEMPTS_MAX = 10;
const PASSWORD_ATTEMPTS_WINDOW_MS = 15 * 60_000;

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return downloadSharedFile(request, params);
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return downloadSharedFile(request, params, true);
}

// The body is read only once the token names a password-protected share, so anonymous callers cannot make
// the server buffer anything by posting to a made-up token.
async function downloadSharedFile(request: Request, params: Promise<{ token: string }>, hasPasswordBody = false) {
  const { token } = await params;
  const repo = createMetadataRepository(getDatabase());
  const share = repo.getFileShareLinkByTokenHash(hashShareToken(token));

  if (!share || !isShareUsable(share)) {
    return NextResponse.json({ error: "share not found" }, { status: 404 });
  }

  if (share.passwordProtected) {
    const payload = hasPasswordBody ? await readPasswordPayload(request) : {};
    if (!payload) {
      return bodyTooLarge(SMALL_BODY_MAX_BYTES);
    }
    const password = payload.password;
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

// JSON, or the urlencoded form the share page posts. null means the body passed the size cap.
async function readPasswordPayload(request: Request): Promise<{ password?: string } | null> {
  const contentType = request.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  if (!isJson && !contentType.includes("application/x-www-form-urlencoded")) {
    return {};
  }

  const raw = await readLimitedBody(request, SMALL_BODY_MAX_BYTES);
  if (!raw) {
    return null;
  }
  const password = isJson ? parseJsonObject(raw)?.password : new URLSearchParams(raw.toString("utf8")).get("password");
  return typeof password === "string" ? { password } : {};
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
