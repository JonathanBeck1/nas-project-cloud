import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";
import { getAppConfig } from "@/lib/server/config";
import { enqueuePreviewForFile } from "@/lib/server/previews/enqueue";
import { classifyFile } from "@/lib/shared/fileTypes";

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const repo = createMetadataRepository(getDatabase());
  const { searchParams } = new URL(request.url);
  const limit = Number.parseInt(searchParams.get("limit") ?? "", 10);

  try {
    const page = repo.listFilesPage(
      {
        query: searchParams.get("query") ?? undefined,
        projectId: searchParams.get("projectId") ?? undefined,
        categoryId: searchParams.get("categoryId") ?? undefined
      },
      { limit: Number.isInteger(limit) ? limit : undefined, cursor: searchParams.get("cursor") }
    );
    return NextResponse.json(page);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "INVALID_CURSOR") {
      return NextResponse.json({ error: "invalid cursor" }, { status: 400 });
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const config = getAppConfig();
  const url = new URL(request.url);
  const params = url.searchParams;

  const filename = stringValue(params.get("filename")) || "upload.bin";
  const relativePath = stringValue(params.get("relativePath"));
  const sourceDevice = stringValue(params.get("sourceDevice")) || "Unknown Device";
  const projectId = nullableStringValue(params.get("projectId"));
  const projectSlug = stringValue(params.get("projectSlug"));
  const categoryId = nullableStringValue(params.get("categoryId"));
  const mimeType = stringValue(params.get("mimeType")) || request.headers.get("content-type") || "application/octet-stream";

  if (Boolean(projectId) !== Boolean(projectSlug)) {
    return NextResponse.json({ error: "projectId and projectSlug must be provided together" }, { status: 400 });
  }

  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(contentLength) && contentLength > config.maxUploadBytes) {
    return NextResponse.json({ error: "file exceeds upload size limit" }, { status: 413 });
  }

  if (!request.body) {
    return NextResponse.json({ error: "request body is required" }, { status: 400 });
  }

  const repo = createMetadataRepository(getDatabase());

  let target: { kind: "inbox"; sourceDevice: string } | { kind: "project"; projectSlug: string } = {
    kind: "inbox",
    sourceDevice
  };

  if (categoryId) {
    const categoryExists = repo.listCategories().some((category) => category.id === categoryId);
    if (!categoryExists) {
      return NextResponse.json({ error: "category not found" }, { status: 404 });
    }
  }

  if (projectId) {
    const project = repo.getProjectById(projectId);
    if (!project) {
      return NextResponse.json({ error: "project not found" }, { status: 404 });
    }

    if (project.slug !== projectSlug) {
      return NextResponse.json({ error: "project slug mismatch" }, { status: 400 });
    }

    target = { kind: "project", projectSlug: project.slug };
  }

  const storage = createStorageService();
  let stored;
  try {
    stored = await storage.streamUpload({
      target,
      filename,
      relativePath,
      mimeType,
      body: request.body,
      maxBytes: config.maxUploadBytes
    });
  } catch (error) {
    if (error instanceof Error && error.message === "upload exceeds size limit") {
      return NextResponse.json({ error: "file exceeds upload size limit" }, { status: 413 });
    }
    return NextResponse.json({ error: "upload failed" }, { status: 500 });
  }

  const classification = classifyFile(filename);
  let file;
  try {
    file = repo.createFile({
      name: filename,
      extension: classification.extension,
      family: classification.family,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      checksum: stored.checksum,
      storagePath: stored.relativePath,
      projectId,
      categoryId,
      sourceDevice
    });
  } catch {
    try {
      await storage.deleteFile(stored.relativePath);
    } catch {
      return NextResponse.json({ error: "file operation requires manual repair" }, { status: 500 });
    }
    return NextResponse.json({ error: "file metadata create failed" }, { status: 500 });
  }

  enqueuePreviewForFile(repo, file);
  return NextResponse.json({ file }, { status: 201 });
}

function stringValue(value: string | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableStringValue(value: string | null): string | null {
  const parsed = stringValue(value);
  return parsed.length > 0 ? parsed : null;
}
