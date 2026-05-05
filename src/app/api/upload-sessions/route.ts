import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { appConfig } from "@/lib/server/config";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const filename = stringValue(body.filename) || "upload.bin";
  const mimeType = stringValue(body.mimeType) || "application/octet-stream";
  const sizeBytes = numberValue(body.sizeBytes);
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    return NextResponse.json({ error: "sizeBytes must be a positive integer" }, { status: 400 });
  }
  if (sizeBytes > appConfig.maxUploadBytes) {
    return NextResponse.json({ error: "file exceeds upload size limit" }, { status: 413 });
  }

  const sourceDevice = stringValue(body.sourceDevice) || "Unknown Device";
  const projectId = nullableStringValue(body.projectId);
  const projectSlug = stringValue(body.projectSlug);
  if (Boolean(projectId) !== Boolean(projectSlug)) {
    return NextResponse.json({ error: "projectId and projectSlug must be provided together" }, { status: 400 });
  }

  const categoryId = nullableStringValue(body.categoryId);
  const repo = createMetadataRepository(getDatabase());

  if (categoryId) {
    const categoryExists = repo.listCategories().some((category) => category.id === categoryId);
    if (!categoryExists) {
      return NextResponse.json({ error: "category not found" }, { status: 404 });
    }
  }

  let targetKind: "inbox" | "project" = "inbox";
  let resolvedProjectSlug: string | null = null;

  if (projectId) {
    const project = repo.getProjectById(projectId);
    if (!project) {
      return NextResponse.json({ error: "project not found" }, { status: 404 });
    }
    if (project.slug !== projectSlug) {
      return NextResponse.json({ error: "project slug mismatch" }, { status: 400 });
    }
    targetKind = "project";
    resolvedProjectSlug = project.slug;
  }

  const storage = createStorageService();
  const temp = await storage.createUploadTempPath(`upload_${nanoid(12)}`);
  try {
    const session = repo.createUploadSession({
      filename,
      mimeType,
      sizeBytes,
      checksum: nullableStringValue(body.checksum),
      userId: auth.userId,
      deviceId: auth.deviceId,
      targetKind,
      sourceDevice,
      projectId,
      projectSlug: resolvedProjectSlug,
      categoryId,
      tempPath: temp.relativePath
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch {
    await storage.abortUploadSession(temp.relativePath).catch(() => undefined);
    return NextResponse.json({ error: "upload session create failed" }, { status: 500 });
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableStringValue(value: unknown): string | null {
  const parsed = stringValue(value);
  return parsed.length > 0 ? parsed : null;
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}
