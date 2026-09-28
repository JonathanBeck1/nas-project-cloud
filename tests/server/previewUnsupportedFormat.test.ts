import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PreviewJob } from "@/lib/shared/types";

// What the prebuilt sharp/libvips reports for an HEVC-coded HEIC, the format iPhones save photos in.
const HEVC_ERROR =
  "Input file has corrupt header: /storage/Inbox/iPhone/IMG_0001.heic: bad seek to 7104\n" +
  "heif: Error while loading plugin: Support for this compression format has not been built in (11.6003)";

vi.mock("sharp", () => {
  const chain = {
    rotate: () => chain,
    resize: () => chain,
    webp: () => chain,
    toFile: async () => {
      throw new Error(HEVC_ERROR);
    },
    toBuffer: async () => {
      throw new Error(HEVC_ERROR);
    }
  };
  return { default: Object.assign(() => chain, { concurrency: () => 1 }) };
});

const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("image formats the bundled decoder cannot read", () => {
  it("are recorded as unsupported with a readable reason, not as failed", async () => {
    const { processPreviewJob } = await import("@/lib/server/previews/worker");
    const { createStorageService } = await import("@/lib/server/storage");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-heic-"));
    createdDirs.push(root);
    fs.mkdirSync(path.join(root, "Inbox", "iPhone"), { recursive: true });
    fs.writeFileSync(path.join(root, "Inbox", "iPhone", "IMG_0001.heic"), "not decodable here");
    const repo = { upsertFilePreview: vi.fn() };
    const job = {
      file: { id: "file_heic", family: "image", extension: "heic", storagePath: "Inbox/iPhone/IMG_0001.heic" },
      preview: { fileId: "file_heic", kind: "image", status: "pending" }
    } as PreviewJob;

    await processPreviewJob({ job, repo, storage: createStorageService(root) });

    expect(repo.upsertFilePreview).toHaveBeenCalledTimes(1);
    const recorded = repo.upsertFilePreview.mock.calls[0][0];
    expect(recorded).toMatchObject({ fileId: "file_heic", status: "unsupported" });
    expect(recorded.error).not.toContain("/storage/");
    expect(recorded.error).not.toContain("\n");
  });
});
