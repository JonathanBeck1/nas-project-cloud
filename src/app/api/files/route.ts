import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";
import { appConfig } from "@/lib/server/config";
import { classifyFile } from "@/lib/shared/fileTypes";

export async function GET(request: Request) {
  const repo = createMetadataRepository(getDatabase());
  const { searchParams } = new URL(request.url);
  const files = repo.listFiles({
    query: searchParams.get("query") ?? undefined,
    projectId: searchParams.get("projectId") ?? undefined,
    categoryId: searchParams.get("categoryId") ?? undefined
  });

  return NextResponse.json({ files });
}

export async function POST(request: Request) {
  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(contentLength) && contentLength > appConfig.maxUploadBytes) {
    return NextResponse.json({ error: "file exceeds upload size limit" }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }

  const upload = formData.get("file");

  if (!(upload instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (upload.size > appConfig.maxUploadBytes) {
    return NextResponse.json({ error: "file exceeds upload size limit" }, { status: 413 });
  }

  const filename = upload.name || "upload.bin";
  const mimeType = upload.type || "application/octet-stream";
  const bytes = Buffer.from(await upload.arrayBuffer());

  if (bytes.length > appConfig.maxUploadBytes) {
    return NextResponse.json({ error: "file exceeds upload size limit" }, { status: 413 });
  }

  const sourceDevice = stringValue(formData.get("sourceDevice")) || "Unknown Device";
  const projectId = nullableStringValue(formData.get("projectId"));
  const projectSlug = stringValue(formData.get("projectSlug"));
  if (Boolean(projectId) !== Boolean(projectSlug)) {
    return NextResponse.json({ error: "projectId and projectSlug must be provided together" }, { status: 400 });
  }

  const categoryId = nullableStringValue(formData.get("categoryId"));
  const storage = createStorageService();
  const stored = await storage.writeUpload({
    target: projectSlug ? { kind: "project", projectSlug } : { kind: "inbox", sourceDevice },
    filename,
    mimeType,
    bytes
  });
  const classification = classifyFile(filename);
  const repo = createMetadataRepository(getDatabase());
  const file = repo.createFile({
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

  return NextResponse.json({ file }, { status: 201 });
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableStringValue(value: FormDataEntryValue | null): string | null {
  const parsed = stringValue(value);
  return parsed.length > 0 ? parsed : null;
}
