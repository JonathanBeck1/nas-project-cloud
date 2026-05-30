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
    listFileShareAccessEvents: vi.fn(),
    listFileShareLinks: vi.fn(),
    revokeFileShareLink: vi.fn(),
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
    mocks.repo.listFileShareAccessEvents.mockReturnValue([]);
    mocks.repo.listFileShareLinks.mockReturnValue([]);
    mocks.repo.revokeFileShareLink.mockReturnValue(null);
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

  it("lists share links for an active file", async () => {
    const { GET } = await import("@/app/api/files/[id]/shares/route");
    const share = {
      id: "share_123",
      fileId: "file_123",
      label: null,
      expiresAt: "2026-05-31T00:00:00.000Z",
      maxDownloads: null,
      downloadCount: 2,
      revokedAt: null,
      createdByUserId: "user_1",
      createdAt: "2026-05-30T00:00:00.000Z",
      updatedAt: "2026-05-30T00:00:00.000Z",
      lastAccessedAt: "2026-05-30T01:00:00.000Z"
    };
    mocks.repo.listFileShareLinks.mockReturnValue([share]);

    const response = await GET(new Request("http://localhost/api/files/file_123/shares"), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ shares: [share] });
    expect(mocks.repo.listFileShareLinks).toHaveBeenCalledWith("file_123");
  });

  it("revokes a share link for an active file", async () => {
    const { DELETE } = await import("@/app/api/files/[id]/shares/[shareId]/route");
    const share = {
      id: "share_123",
      fileId: "file_123",
      label: null,
      expiresAt: "2026-05-31T00:00:00.000Z",
      maxDownloads: null,
      downloadCount: 2,
      revokedAt: "2026-05-30T01:00:00.000Z",
      createdByUserId: "user_1",
      createdAt: "2026-05-30T00:00:00.000Z",
      updatedAt: "2026-05-30T01:00:00.000Z",
      lastAccessedAt: null
    };
    mocks.repo.revokeFileShareLink.mockReturnValue(share);

    const response = await DELETE(new Request("http://localhost/api/files/file_123/shares/share_123"), {
      params: Promise.resolve({ id: "file_123", shareId: "share_123" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ share });
    expect(mocks.repo.revokeFileShareLink).toHaveBeenCalledWith("file_123", "share_123");
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

    const response = await GET(
      new Request("http://localhost/api/shares/share-token/download", {
        headers: {
          "user-agent": "Safari on Mac",
          "x-forwarded-for": "192.168.68.10, 10.0.0.1"
        }
      }),
      {
        params: Promise.resolve({ token: "share-token" })
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.requireApiSession).not.toHaveBeenCalled();
    expect(mocks.repo.getFileShareLinkByTokenHash).toHaveBeenCalledWith(hashShareToken("share-token"));
    expect(mocks.repo.recordFileShareDownload).toHaveBeenCalledWith("share_123", {
      userAgent: "Safari on Mac",
      ipAddress: "192.168.68.10"
    });
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

  it("lists access events for an owned share link", async () => {
    const { GET } = await import("@/app/api/files/[id]/shares/[shareId]/events/route");
    const event = {
      id: "event_123",
      shareId: "share_123",
      fileId: "file_123",
      accessedAt: "2026-05-30T02:00:00.000Z",
      userAgent: "Safari on Mac",
      ipAddress: "192.168.68.10"
    };
    mocks.repo.listFileShareLinks.mockReturnValue([
      {
        id: "share_123",
        fileId: "file_123",
        label: null,
        expiresAt: "2026-05-31T00:00:00.000Z",
        maxDownloads: null,
        downloadCount: 1,
        revokedAt: null,
        createdByUserId: "user_1",
        createdAt: "2026-05-30T00:00:00.000Z",
        updatedAt: "2026-05-30T02:00:00.000Z",
        lastAccessedAt: "2026-05-30T02:00:00.000Z"
      }
    ]);
    mocks.repo.listFileShareAccessEvents.mockReturnValue([event]);

    const response = await GET(new Request("http://localhost/api/files/file_123/shares/share_123/events"), {
      params: Promise.resolve({ id: "file_123", shareId: "share_123" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ events: [event] });
    expect(mocks.repo.listFileShareAccessEvents).toHaveBeenCalledWith("share_123");
  });
});
