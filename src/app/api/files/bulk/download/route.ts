import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import * as archiver from "archiver";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";
import type { CloudFile } from "@/lib/shared/types";

const MAX_BULK_DOWNLOAD_FILES = 200;

type ZipFile = {
  file: CloudFile;
  absolutePath: string;
};

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const fileIds = uniqueFileIds(new URL(request.url).searchParams.getAll("fileIds"));
  if (fileIds.length === 0 || fileIds.length > MAX_BULK_DOWNLOAD_FILES) {
    return NextResponse.json({ error: "invalid bulk download" }, { status: 400 });
  }

  const repo = createMetadataRepository(getDatabase());
  const storage = createStorageService();
  const files: ZipFile[] = [];

  for (const id of fileIds) {
    const file = repo.getFileById(id);
    if (!file || file.status !== "active") {
      return NextResponse.json({ error: "file not found" }, { status: 404 });
    }

    try {
      const absolutePath = storage.absolutePathFor(file.storagePath);
      const details = await stat(absolutePath);
      if (!details.isFile()) {
        return NextResponse.json({ error: "file not found" }, { status: 404 });
      }
      files.push({ file, absolutePath });
    } catch {
      return NextResponse.json({ error: "file not found" }, { status: 404 });
    }
  }

  const stream = createZipStream(files);
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="nas-project-cloud-files.zip"; filename*=UTF-8''nas-project-cloud-files.zip`,
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "no-store"
    }
  });
}

function createZipStream(files: ZipFile[]): PassThrough {
  const output = new PassThrough();
  const archive = archiver.create("zip", { store: true });
  const usedNames = new Set<string>();

  archive.on("error", (error) => output.destroy(error));
  archive.pipe(output);

  for (const { file, absolutePath } of files) {
    archive.append(createReadStream(absolutePath), { name: uniqueZipEntryName(file.name, usedNames) });
  }

  void archive.finalize();
  return output;
}

function uniqueFileIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(id);
  }
  return result;
}

function uniqueZipEntryName(name: string, usedNames: Set<string>): string {
  const safeName = safeZipEntryName(name);
  const parsed = path.parse(safeName);

  for (let index = 1; index < 10_000; index += 1) {
    const candidate = index === 1 ? safeName : `${parsed.name}-${index}${parsed.ext}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }

  throw new Error(`Could not allocate zip entry name for ${safeName}`);
}

function safeZipEntryName(name: string): string {
  const base = path.basename(name).replace(/[\x00-\x1F\x7F]/g, "_").trim();
  return base && base !== "." && base !== ".." ? base : "download.bin";
}
