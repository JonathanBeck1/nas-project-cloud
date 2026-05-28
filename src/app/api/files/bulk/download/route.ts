import { stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";
import { createZipDownloadResponse } from "@/lib/server/zipDownload";
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

  return createZipDownloadResponse(files, "nas-project-cloud-files.zip");
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
