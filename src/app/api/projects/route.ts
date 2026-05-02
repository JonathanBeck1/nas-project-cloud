import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

const createProjectSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().default(""),
  categoryId: z.string().nullable().default(null)
});

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const repo = createMetadataRepository(getDatabase());
  return NextResponse.json({ projects: repo.listProjects() });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid project" }, { status: 400 });
  }

  const parsed = createProjectSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid project" }, { status: 400 });
  }

  const repo = createMetadataRepository(getDatabase());
  const project = repo.createProject(parsed.data);

  return NextResponse.json({ project }, { status: 201 });
}
