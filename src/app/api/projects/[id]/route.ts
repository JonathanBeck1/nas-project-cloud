import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";

const projectStatusSchema = z.enum(["active", "paused", "complete", "archived"]);
const deleteProjectSchema = z
  .object({
    fileAction: z.enum(["detach", "moveToInbox"]).default("detach")
  })
  .strict();

const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(2000).optional(),
    status: projectStatusSchema.optional(),
    categoryId: z.string().trim().min(1).nullable().optional()
  })
  .strict()
  .refine(
    (data) =>
      data.name !== undefined ||
      data.description !== undefined ||
      data.status !== undefined ||
      data.categoryId !== undefined,
    "no changes provided"
  );

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
    return NextResponse.json({ error: "invalid project update" }, { status: 400 });
  }

  const parsed = updateProjectSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid project update" }, { status: 400 });
  }

  const repo = createMetadataRepository(getDatabase());

  if (parsed.data.categoryId !== undefined && parsed.data.categoryId !== null) {
    const category = repo.getCategoryById(parsed.data.categoryId);
    if (!category) {
      return NextResponse.json({ error: "category not found" }, { status: 404 });
    }
  }

  const updated = repo.updateProject(id, parsed.data);
  if (!updated) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  return NextResponse.json({ project: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const repo = createMetadataRepository(getDatabase());
  const parsed = deleteProjectSchema.safeParse(await optionalJson(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid project delete" }, { status: 400 });
  }

  let movedFiles = 0;
  if (parsed.data.fileAction === "moveToInbox") {
    const project = repo.getProjectById(id);
    if (!project) {
      return NextResponse.json({ error: "project not found" }, { status: 404 });
    }

    const storage = createStorageService();
    const files = repo.listFiles({ projectId: id });
    for (const file of files) {
      if (file.status !== "active") {
        continue;
      }

      const moved = await storage.moveToInbox({
        currentRelativePath: file.storagePath,
        sourceDevice: file.sourceDevice,
        filename: file.name
      });
      const updated = repo.updateFile(
        file.id,
        { projectId: null, storagePath: moved.relativePath },
        { storagePath: file.storagePath, status: "active" }
      );
      if (!updated) {
        return NextResponse.json({ error: "could not update moved file metadata" }, { status: 409 });
      }
      movedFiles += 1;
    }
  }

  const result = repo.deleteProject(id);
  if (!result.removed) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, detachedFiles: result.detachedFiles, movedFiles });
}

async function optionalJson(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}
