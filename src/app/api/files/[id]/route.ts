import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";
import type { CloudFile } from "@/lib/shared/types";

const updateFileSchema = z
  .object({
    projectId: z.string().min(1).nullable().optional(),
    categoryId: z.string().min(1).nullable().optional(),
    tagIds: z.array(z.string().min(1)).optional()
  })
  .strict()
  .refine((data) => data.projectId !== undefined || data.categoryId !== undefined || data.tagIds !== undefined);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const file = createMetadataRepository(getDatabase()).getFileById(id);

  if (!file || file.status !== "active") {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  return NextResponse.json({ file });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid file update" }, { status: 400 });
  }

  const parsed = updateFileSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid file update" }, { status: 400 });
  }

  const repo = createMetadataRepository(getDatabase());
  const file = repo.getFileById(id);
  if (!file || file.status !== "active") {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const storage = createStorageService();
  const update: { projectId?: string | null; categoryId?: string | null; storagePath?: string } = {};
  let moved: { relativePath: string } | null = null;

  if (parsed.data.categoryId !== undefined) {
    update.categoryId = parsed.data.categoryId;
    if (parsed.data.categoryId) {
      const categoryExists = repo.listCategories().some((category) => category.id === parsed.data.categoryId);
      if (!categoryExists) {
        return NextResponse.json({ error: "category not found" }, { status: 404 });
      }
    }
  }

  if (parsed.data.projectId !== undefined) {
    update.projectId = parsed.data.projectId;
    if (parsed.data.projectId) {
      const project = repo.getProjectById(parsed.data.projectId);
      if (!project) {
        return NextResponse.json({ error: "project not found" }, { status: 404 });
      }
      moved = await storage.moveToProject({
        currentRelativePath: file.storagePath,
        projectSlug: project.slug,
        filename: file.name
      });
      update.storagePath = moved.relativePath;
    }
  }

  let updated: CloudFile | null = file;
  try {
    if (Object.keys(update).length > 0) {
      updated = repo.updateFile(id, update, { storagePath: file.storagePath, status: "active" });
    }
  } catch {
    try {
      await rollbackMovedFile(storage, moved?.relativePath, file.storagePath);
    } catch {
      return NextResponse.json({ error: "file operation requires manual repair" }, { status: 500 });
    }
    return NextResponse.json({ error: "file metadata update failed" }, { status: 500 });
  }

  if (!updated) {
    try {
      await rollbackMovedFile(storage, moved?.relativePath, file.storagePath);
    } catch {
      return NextResponse.json({ error: "file operation requires manual repair" }, { status: 500 });
    }
  }

  if (updated && parsed.data.tagIds !== undefined) {
    updated = repo.setFileTags(id, parsed.data.tagIds);
  }

  return updated
    ? NextResponse.json({ file: updated })
    : NextResponse.json({ error: "file not found" }, { status: 404 });
}

async function rollbackMovedFile(
  storage: ReturnType<typeof createStorageService>,
  currentRelativePath: string | undefined,
  targetRelativePath: string
) {
  if (!currentRelativePath) {
    return;
  }

  await storage.restoreFile({ currentRelativePath, targetRelativePath });
}
