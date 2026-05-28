import { stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";
import { createZipDownloadResponse, type ZipDownloadFile } from "@/lib/server/zipDownload";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const repo = createMetadataRepository(getDatabase());
  const project = repo.getProjectById(id);
  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  const storage = createStorageService();
  const files: ZipDownloadFile[] = [];

  for (const file of repo.listFiles({ projectId: id })) {
    if (file.status !== "active") {
      continue;
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

  return createZipDownloadResponse(files, `${project.slug}.zip`);
}
