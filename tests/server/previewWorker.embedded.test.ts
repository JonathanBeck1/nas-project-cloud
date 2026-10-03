import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processPreviewJob } from "@/lib/server/previews/worker";
import { createStorageService } from "@/lib/server/storage";
import type { PreviewJob } from "@/lib/shared/types";
import { gcode, thumbnailBlock } from "../helpers/gcode";
import { binaryStl, cube } from "../helpers/stl";
import { png, relsXml, writeZip } from "../helpers/threeMf";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-3mf-worker-"));
  fs.mkdirSync(path.join(root, "Projects", "shed", "Inbox"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const job = (storagePath: string) =>
  ({
    file: { id: "file_plate", family: "cad", extension: "3mf", storagePath },
    preview: { fileId: "file_plate", kind: "cad", status: "pending" }
  }) as PreviewJob;

describe("3MF previews", () => {
  it("turns the embedded thumbnail into a ready webp preview", async () => {
    const storagePath = "Projects/shed/Inbox/bracket.3mf";
    await writeZip(path.join(root, storagePath), [
      { name: "3D/3dmodel.model", data: "<model/>" },
      { name: "_rels/.rels", data: relsXml("/Metadata/plate_1.png") },
      { name: "Metadata/plate_1.png", data: await png(800, 600, "#d03030") }
    ]);
    const repo = { upsertFilePreview: vi.fn() };

    await processPreviewJob({ job: job(storagePath), repo, storage: createStorageService(root) });

    expect(repo.upsertFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "file_plate", kind: "cad", status: "ready", previewPath: ".previews/images/file_plate.webp", width: 384, height: 288 })
    );
    const written = await sharp(path.join(root, ".previews", "images", "file_plate.webp")).metadata();
    expect(written).toMatchObject({ format: "webp", width: 384, height: 288 });
  });

  it("records a 3MF without an embedded image as skipped, so no chip is shown", async () => {
    const storagePath = "Projects/shed/Inbox/plain.3mf";
    await writeZip(path.join(root, storagePath), [{ name: "3D/3dmodel.model", data: "<model/>" }]);
    const repo = { upsertFilePreview: vi.fn() };

    await processPreviewJob({ job: job(storagePath), repo, storage: createStorageService(root) });

    expect(repo.upsertFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({ status: "skipped", error: "no embedded thumbnail" })
    );
  });

  it("records a damaged 3MF as failed with a message that does not leak the storage path", async () => {
    const storagePath = "Projects/shed/Inbox/broken.3mf";
    fs.writeFileSync(path.join(root, storagePath), "not a zip");
    const repo = { upsertFilePreview: vi.fn() };

    await processPreviewJob({ job: job(storagePath), repo, storage: createStorageService(root) });

    const recorded = repo.upsertFilePreview.mock.calls[0][0];
    expect(recorded).toMatchObject({ status: "failed" });
    expect(recorded.error).not.toContain(root);
  });
});

describe("G-code previews", () => {
  const gcodeJob = (storagePath: string) =>
    ({
      file: { id: "file_print", family: "cad", extension: "gcode", storagePath },
      preview: { fileId: "file_print", kind: "cad", status: "pending" }
    }) as PreviewJob;

  it("turns the slicer thumbnail into a ready webp preview", async () => {
    const storagePath = "Projects/shed/Inbox/bracket.gcode";
    fs.writeFileSync(path.join(root, storagePath), gcode(thumbnailBlock(await png(400, 300, "#3030d0"), 400, 300)));
    const repo = { upsertFilePreview: vi.fn() };

    await processPreviewJob({ job: gcodeJob(storagePath), repo, storage: createStorageService(root) });

    expect(repo.upsertFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "file_print", kind: "cad", status: "ready", width: 384, height: 288 })
    );
  });

  it("records G-code without a thumbnail as skipped", async () => {
    const storagePath = "Projects/shed/Inbox/plain.gcode";
    fs.writeFileSync(path.join(root, storagePath), gcode());
    const repo = { upsertFilePreview: vi.fn() };

    await processPreviewJob({ job: gcodeJob(storagePath), repo, storage: createStorageService(root) });

    expect(repo.upsertFilePreview).toHaveBeenCalledWith(expect.objectContaining({ status: "skipped", error: "no embedded thumbnail" }));
  });
});

describe("STL previews", () => {
  const stlJob = (storagePath: string) =>
    ({
      file: { id: "file_mesh", family: "cad", extension: "stl", storagePath },
      preview: { fileId: "file_mesh", kind: "cad", status: "pending" }
    }) as PreviewJob;

  it("draws the mesh into a ready webp preview", async () => {
    const storagePath = "Projects/shed/Inbox/bracket.stl";
    fs.writeFileSync(path.join(root, storagePath), binaryStl(cube()));
    const repo = { upsertFilePreview: vi.fn() };

    await processPreviewJob({ job: stlJob(storagePath), repo, storage: createStorageService(root) });

    expect(repo.upsertFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "file_mesh", kind: "cad", status: "ready", width: 384, height: 288 })
    );
    const written = await sharp(path.join(root, ".previews", "images", "file_mesh.webp")).metadata();
    expect(written).toMatchObject({ format: "webp", width: 384, height: 288, hasAlpha: true });
  });

  it("records an empty STL as skipped with its own reason", async () => {
    const storagePath = "Projects/shed/Inbox/empty.stl";
    fs.writeFileSync(path.join(root, storagePath), binaryStl([]));
    const repo = { upsertFilePreview: vi.fn() };

    await processPreviewJob({ job: stlJob(storagePath), repo, storage: createStorageService(root) });

    expect(repo.upsertFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({ status: "skipped", error: "no triangles to draw" })
    );
  });
});
