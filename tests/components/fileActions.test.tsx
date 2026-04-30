import { afterEach, describe, expect, it, vi } from "vitest";
import { archiveFile, updateFileAssignment } from "@/lib/client/fileActions";

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
    expect(fetchMock).toHaveBeenCalledWith("/api/files/file_123/archive", { method: "POST" });
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
});
