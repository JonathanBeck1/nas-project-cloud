import { afterEach, describe, expect, it, vi } from "vitest";
import {
  archiveFile,
  createFileShareLink,
  deleteFilePermanently,
  listFileShareLinks,
  renameFile,
  revokeFileShareLink,
  restoreFile,
  updateFileAssignment
} from "@/lib/client/fileActions";

describe("fileActions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("archives files through the archive endpoint", async () => {
    const file = { id: "file_123", status: "archived" };
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ file }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(archiveFile("file_123")).resolves.toEqual(file);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/files/file_123/archive",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("updates file assignment through patch", async () => {
    const file = { id: "file_123", projectId: "proj_123" };
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ file }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateFileAssignment("file_123", { projectId: "proj_123", categoryId: "cat_cad" })
    ).resolves.toEqual(file);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/files/file_123",
      expect.objectContaining({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "proj_123", categoryId: "cat_cad" })
      })
    );
  });

  it("renames files through patch", async () => {
    const file = { id: "file_123", name: "bracket-final.stl" };
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ file }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(renameFile("file_123", "bracket-final.stl")).resolves.toEqual(file);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/files/file_123",
      expect.objectContaining({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "bracket-final.stl" })
      })
    );
  });

  it("creates file share links through the share endpoint", async () => {
    const payload = {
      share: {
        id: "share_123",
        fileId: "file_123",
        label: null,
        expiresAt: "2026-05-31T00:00:00.000Z",
        maxDownloads: null,
        downloadCount: 0,
        revokedAt: null,
        createdByUserId: "user_1",
        createdAt: "2026-05-30T00:00:00.000Z",
        updatedAt: "2026-05-30T00:00:00.000Z",
        lastAccessedAt: null
      },
      url: "/api/shares/share-token/download"
    };
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify(payload), { status: 201 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createFileShareLink("file_123", {
        expiresInHours: 168,
        maxDownloads: 3,
        label: "MacBook handoff"
      })
    ).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/files/file_123/shares",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresInHours: 168, maxDownloads: 3, label: "MacBook handoff" })
      })
    );
  });

  it("lists file share links through the share endpoint", async () => {
    const shares = [
      {
        id: "share_123",
        fileId: "file_123",
        label: null,
        expiresAt: "2026-05-31T00:00:00.000Z",
        maxDownloads: null,
        downloadCount: 0,
        revokedAt: null,
        createdByUserId: "user_1",
        createdAt: "2026-05-30T00:00:00.000Z",
        updatedAt: "2026-05-30T00:00:00.000Z",
        lastAccessedAt: null
      }
    ];
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ shares }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listFileShareLinks("file_123")).resolves.toEqual(shares);
    expect(fetchMock).toHaveBeenCalledWith("/api/files/file_123/shares");
  });

  it("revokes file share links through the share endpoint", async () => {
    const share = {
      id: "share_123",
      fileId: "file_123",
      label: null,
      expiresAt: "2026-05-31T00:00:00.000Z",
      maxDownloads: null,
      downloadCount: 0,
      revokedAt: "2026-05-30T01:00:00.000Z",
      createdByUserId: "user_1",
      createdAt: "2026-05-30T00:00:00.000Z",
      updatedAt: "2026-05-30T01:00:00.000Z",
      lastAccessedAt: null
    };
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ share }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(revokeFileShareLink("file_123", "share_123")).resolves.toEqual(share);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/files/file_123/shares/share_123",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("restores archived files through the restore endpoint", async () => {
    const file = { id: "file_123", status: "active" };
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ file }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(restoreFile("file_123")).resolves.toEqual(file);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/files/file_123/restore",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("permanently deletes archived files through the delete endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteFilePermanently("file_123")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/files/file_123/delete",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});
