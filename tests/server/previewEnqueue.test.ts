import { describe, expect, it, vi } from "vitest";
import { enqueuePreviewForFile } from "@/lib/server/previews/enqueue";
import type { CloudFile, FileFamily } from "@/lib/shared/types";

describe("preview enqueue", () => {
  it.each([
    ["image", "image"],
    ["video", "video"],
    ["document", "document"]
  ] as const)("queues %s files with the matching preview kind", (family, kind) => {
    const repo = { upsertFilePreview: vi.fn() };

    enqueuePreviewForFile(repo, fileFixture(family));

    expect(repo.upsertFilePreview).toHaveBeenCalledWith({
      fileId: `file_${family}`,
      kind,
      status: "pending"
    });
  });

  it("does not queue non-preview file families", () => {
    const repo = { upsertFilePreview: vi.fn() };

    enqueuePreviewForFile(repo, fileFixture("cad"));

    expect(repo.upsertFilePreview).not.toHaveBeenCalled();
  });
});

function fileFixture(family: FileFamily): CloudFile {
  return {
    id: `file_${family}`,
    name: `asset.${family}`,
    extension: family,
    family,
    mimeType: "application/octet-stream",
    sizeBytes: 10,
    checksum: "abc",
    storagePath: `Inbox/Browser/asset.${family}`,
    projectId: null,
    categoryId: null,
    sourceDevice: "Browser",
    status: "active",
    archivedAt: null,
    uploadedAt: "2026-05-04T00:00:00.000Z",
    updatedAt: "2026-05-04T00:00:00.000Z",
    tags: []
  };
}
