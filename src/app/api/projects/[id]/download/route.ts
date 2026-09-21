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
  const missing: string[] = [];
  const projectRoot = `Projects/${project.slug}/Inbox/`;

  for (const file of repo.listFiles({ projectId: id })) {
    if (file.status !== "active") {
      continue;
    }

    // Uploads keep their folder structure under the project, so the export does too.
    const entryPath = file.storagePath.startsWith(projectRoot) ? file.storagePath.slice(projectRoot.length) : file.name;
    const absolutePath = storage.absolutePathFor(file.storagePath);
    // SMB edits are not reconciled, so one renamed file must not sink the whole export.
    if (await isFile(absolutePath)) {
      files.push({ file, absolutePath, entryPath });
    } else {
      missing.push(entryPath);
    }
  }

  return createZipDownloadResponse(files, `${project.slug}.zip`, missing);
}

async function isFile(absolutePath: string): Promise<boolean> {
  try {
    return (await stat(absolutePath)).isFile();
  } catch {
    return false;
  }
}
