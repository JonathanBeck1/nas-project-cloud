import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewJob } from "@/lib/shared/types";

const mocks = vi.hoisted(() => ({
  probePoppler: vi.fn(),
  renderPdfFirstPage: vi.fn()
}));

vi.mock("@/lib/server/previews/poppler", () => ({ probePoppler: mocks.probePoppler }));
vi.mock("@/lib/server/previews/pdf", () => ({ renderPdfFirstPage: mocks.renderPdfFirstPage }));

const pdfJob: PreviewJob = {
  file: {
    id: "file_pdf_1",
    name: "datasheet.pdf",
    extension: "pdf",
    family: "document",
    mimeType: "application/pdf",
    sizeBytes: 4096,
    checksum: "pdf",
    storagePath: "Inbox/Browser/datasheet.pdf",
    projectId: null,
    categoryId: null,
    sourceDevice: "Browser",
    status: "active",
    archivedAt: null,
    uploadedAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z",
    tags: []
  },
  preview: {
    fileId: "file_pdf_1",
    kind: "document",
    status: "pending",
    previewPath: null,
    width: null,
    height: null,
    durationSeconds: null,
    error: null,
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z"
  }
};

describe("preview worker — pdf", () => {
  let workDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-pdf-"));
    fs.mkdirSync(path.join(workDir, "Inbox", "Browser"), { recursive: true });
    fs.writeFileSync(path.join(workDir, "Inbox", "Browser", "datasheet.pdf"), Buffer.from("%PDF-1.4\nfake bytes"));
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it("records status: 'unsupported' when pdftoppm is not available", async () => {
    mocks.probePoppler.mockResolvedValue({ available: false, error: "pdftoppm not installed" });
    const { processPreviewJob } = await import("@/lib/server/previews/worker");

    const repo = { upsertFilePreview: vi.fn() };
    const storage = { absolutePathFor: (p: string) => path.join(workDir, p) };

    await processPreviewJob({ job: pdfJob, repo, storage });

    expect(repo.upsertFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "file_pdf_1",
        kind: "document",
        status: "unsupported",
        error: "pdftoppm not installed"
      })
    );
    expect(mocks.renderPdfFirstPage).not.toHaveBeenCalled();
  });

  it("renders first page and writes ready metadata when poppler is available", async () => {
    mocks.probePoppler.mockResolvedValue({ available: true, version: "23.04.0" });
    mocks.renderPdfFirstPage.mockImplementation(async ({ outputPngPath }: { outputPngPath: string }) => {
      // 1x1 PNG (smallest valid input that sharp can read).
      fs.writeFileSync(
        outputPngPath,
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
          "base64"
        )
      );
    });
    const { processPreviewJob } = await import("@/lib/server/previews/worker");

    const repo = { upsertFilePreview: vi.fn() };
    const storage = { absolutePathFor: (p: string) => path.join(workDir, p) };

    await processPreviewJob({ job: pdfJob, repo, storage });

    expect(mocks.renderPdfFirstPage).toHaveBeenCalledTimes(1);
    expect(repo.upsertFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "file_pdf_1",
        kind: "document",
        status: "ready",
        previewPath: expect.stringMatching(/^\.previews\/images\/file_pdf_1\.webp$/)
      })
    );
    expect(fs.existsSync(path.join(workDir, ".previews", "images", "file_pdf_1.webp"))).toBe(true);
  });

  it("records status: 'failed' with stderr context when pdftoppm reports an encrypted PDF", async () => {
    mocks.probePoppler.mockResolvedValue({ available: true });
    mocks.renderPdfFirstPage.mockRejectedValue(
      new Error("pdftoppm exited with code 1: Command Line Error: Incorrect password")
    );
    const { processPreviewJob } = await import("@/lib/server/previews/worker");

    const repo = { upsertFilePreview: vi.fn() };
    const storage = { absolutePathFor: (p: string) => path.join(workDir, p) };

    await processPreviewJob({ job: pdfJob, repo, storage });

    expect(repo.upsertFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "file_pdf_1",
        kind: "document",
        status: "failed",
        error: expect.stringContaining("Incorrect password")
      })
    );
  });

  it("non-PDF documents are still skipped with a clearer message", async () => {
    const docxJob: PreviewJob = {
      ...pdfJob,
      file: {
        ...pdfJob.file,
        id: "file_docx_1",
        name: "spec.docx",
        extension: "docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        storagePath: "Inbox/Browser/spec.docx"
      },
      preview: { ...pdfJob.preview, fileId: "file_docx_1" }
    };
    const { processPreviewJob } = await import("@/lib/server/previews/worker");

    const repo = { upsertFilePreview: vi.fn() };
    const storage = { absolutePathFor: (p: string) => path.join(workDir, p) };

    await processPreviewJob({ job: docxJob, repo, storage });

    expect(repo.upsertFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "file_docx_1",
        status: "skipped",
        error: "preview generation is only supported for PDF documents in v0.3"
      })
    );
    expect(mocks.probePoppler).not.toHaveBeenCalled();
  });
});
