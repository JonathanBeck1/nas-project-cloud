import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";

const updateFileSchema = z.object({
  projectId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional()
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const file = createMetadataRepository(getDatabase()).getFileById(id);

  if (!file) {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  return NextResponse.json({ file });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const update: { projectId?: string | null; categoryId?: string | null; storagePath?: string } = {};

  if (parsed.data.categoryId !== undefined) {
    update.categoryId = parsed.data.categoryId;
  }

  if (parsed.data.projectId !== undefined) {
    update.projectId = parsed.data.projectId;
    if (parsed.data.projectId) {
      const project = repo.getProjectById(parsed.data.projectId);
      if (!project) {
        return NextResponse.json({ error: "project not found" }, { status: 404 });
      }
      const moved = await createStorageService().moveToProject({
        currentRelativePath: file.storagePath,
        projectSlug: project.slug,
        filename: file.name
      });
      update.storagePath = moved.relativePath;
    }
  }

  const updated = repo.updateFile(id, update);
  return updated
    ? NextResponse.json({ file: updated })
    : NextResponse.json({ error: "file not found" }, { status: 404 });
}
