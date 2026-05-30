import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashShareToken } from "@/lib/server/shareLinks";

const mocks = vi.hoisted(() => {
  const repo = {
    createFileShareLink: vi.fn(),
    getFileById: vi.fn(),
    getFileShareLinkByTokenHash: vi.fn(),
    recordFileShareDownload: vi.fn()
  };
  const storage = {
    absolutePathFor: vi.fn()
  };
  const requireApiSession = vi.fn(async () => ({
    ok: true,
    userId: "user_1",
    sessionId: "session_1",
    deviceId: "device_1"
  }));

  return {
    db: {},
    repo,
    storage,
    requireApiSession
  };
});

const createdDirs: string[] = [];

vi.mock("@/lib/server/db", () => ({
  getDatabase: vi.fn(() => mocks.db)
}));

vi.mock("@/lib/server/auth/guards", () => ({
  requireApiSession: mocks.requireApiSession
}));

vi.mock("@/lib/server/metadata", () => ({
  createMetadataRepository: vi.fn(() => mocks.repo)
}));

vi.mock("@/lib/server/storage", () => ({
  createStorageService: vi.fn(() => mocks.storage)
}));

describe("share links API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repo.getFileById.mockReturnValue({
      id: "file_123",
      name: "manual.pdf",
      mimeType: "application/pdf",
      status: "active",
      storagePath: "Inbox/Browser/manual.pdf"
    });
    mocks.repo.createFileShareLink.mockImplementation((input) => ({
      id: "share_123",
      fileId: input.fileId,
      label: input.label,
      expiresAt: input.expiresAt,
      maxDownloads: input.maxDownloads,
      downloadCount: 0,
      revokedAt: null,
      createdByUserId: input.createdByUserId,
      createdAt: "2026-05-30T00:00:00.000Z",
      updatedAt: "2026-05-30T00:00:00.000Z",
      lastAccessedAt: null
    }));
    mocks.repo.getFileShareLinkByTokenHash.mockReturnValue(null);
    mocks.repo.recordFileShareDownload.mockReturnValue(null);
    mocks.storage.absolutePathFor.mockImplementation((relativePath: string) => path.join(os.tmpdir(), relativePath));
  });

  afterEach(() => {
    for (const dir of createdDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates a short-lived share link for an active file", async () => {
    const { POST } = await import("@/app/api/files/[id]/shares/route");

    const response = await POST(
      new Request("http://localhost/api/files/file_123/shares", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expiresInHours: 2, label: "Send to MacBook" })
      }),
      { params: Promise.resolve({ id: "file_123" }) }
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.share).toMatchObject({
      id: "share_123",
      fileId: "file_123",
      label: "Send to MacBook",
      downloadCount: 0
    });
    expect(payload.url).toMatch(/^\/api\/shares\/[A-Za-z0-9_-]+\/download$/);
    expect(mocks.repo.createFileShareLink).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "file_123",
        createdByUserId: "user_1",
        label: "Send to MacBook",
        maxDownloads: null,
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    );
  });

  it("rejects share creation for archived files", async () => {
    const { POST } = await import("@/app/api/files/[id]/shares/route");
    mocks.repo.getFileById.mockReturnValue({
      id: "file_123",
      name: "manual.pdf",
      status: "archived",
      storagePath: "Archive/2026/05/manual.pdf"
    });

    const response = await POST(new Request("http://localhost/api/files/file_123/shares", { method: "POST" }), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "file not found" });
    expect(mocks.repo.createFileShareLink).not.toHaveBeenCalled();
  });

  it("streams a shared file without an owner session", async () => {
    const { GET } = await import("@/app/api/shares/[token]/download/route");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-share-"));
    createdDirs.push(dir);
    fs.mkdirSync(path.join(dir, "Inbox", "Browser"), { recursive: true });
    fs.writeFileSync(path.join(dir, "Inbox", "Browser", "manual.pdf"), "manual");
    mocks.storage.absolutePathFor.mockImplementation((relativePath: string) => path.join(dir, relativePath));
    mocks.repo.getFileShareLinkByTokenHash.mockReturnValue({
      id: "share_123",
      fileId: "file_123",
      label: null,
      expiresAt: "2099-01-01T00:00:00.000Z",
      maxDownloads: 5,
      downloadCount: 0,
      revokedAt: null,
      createdByUserId: "user_1",
      createdAt: "2026-05-30T00:00:00.000Z",
      updatedAt: "2026-05-30T00:00:00.000Z",
      lastAccessedAt: null
    });

    const response = await GET(new Request("http://localhost/api/shares/share-token/download"), {
      params: Promise.resolve({ token: "share-token" })
    });

    expect(response.status).toBe(200);
    expect(mocks.requireApiSession).not.toHaveBeenCalled();
    expect(mocks.repo.getFileShareLinkByTokenHash).toHaveBeenCalledWith(hashShareToken("share-token"));
    expect(mocks.repo.recordFileShareDownload).toHaveBeenCalledWith("share_123");
    expect(response.headers.get("content-disposition")).toContain('filename="manual.pdf"');
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.text()).resolves.toBe("manual");
  });

  it("returns 404 for expired share links", async () => {
    const { GET } = await import("@/app/api/shares/[token]/download/route");
    mocks.repo.getFileShareLinkByTokenHash.mockReturnValue({
      id: "share_123",
      fileId: "file_123",
      expiresAt: "2000-01-01T00:00:00.000Z",
      maxDownloads: null,
      downloadCount: 0,
      revokedAt: null
    });

    const response = await GET(new Request("http://localhost/api/shares/share-token/download"), {
      params: Promise.resolve({ token: "share-token" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "share not found" });
    expect(mocks.storage.absolutePathFor).not.toHaveBeenCalled();
    expect(mocks.repo.recordFileShareDownload).not.toHaveBeenCalled();
  });
});
