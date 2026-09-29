import { describe, expect, it, vi } from "vitest";
import { enqueuePreviewForFile } from "@/lib/server/previews/enqueue";
import type { CloudFile, FileFamily } from "@/lib/shared/types";

describe("preview enqueue", () => {
  it.each([
    ["image", "png", "image"],
    ["video", "mp4", "video"],
    ["document", "pdf", "document"],
    ["cad", "3mf", "cad"]
  ] as const)("queues %s files with the matching preview kind", (family, extension, kind) => {
    const repo = { upsertFilePreview: vi.fn() };

    enqueuePreviewForFile(repo, fileFixture(family, extension));

    expect(repo.upsertFilePreview).toHaveBeenCalledWith({
      fileId: `file_${family}`,
      kind,
      status: "pending"
    });
  });

  it.each(["docx", "txt", "csv"])("does not queue a .%s document, which has no preview pipeline", (extension) => {
    const repo = { upsertFilePreview: vi.fn() };

    enqueuePreviewForFile(repo, fileFixture("document", extension));

    expect(repo.upsertFilePreview).not.toHaveBeenCalled();
  });

  it("does not queue non-preview file families or CAD formats without an embedded thumbnail", () => {
    const repo = { upsertFilePreview: vi.fn() };

    enqueuePreviewForFile(repo, fileFixture("cad", "stl"));
    enqueuePreviewForFile(repo, fileFixture("archive", "zip"));

    expect(repo.upsertFilePreview).not.toHaveBeenCalled();
  });
});

function fileFixture(family: FileFamily, extension: string = family): CloudFile {
  return {
    id: `file_${family}`,
    name: `asset.${extension}`,
    extension,
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
