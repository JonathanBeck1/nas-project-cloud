import { NextResponse } from "next/server";
import { z } from "zod";
import { adminOnly } from "@/lib/server/auth/access";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

const memberSchema = z.object({ access: z.enum(["edit", "view"]) }).strict();

type Params = { params: Promise<{ id: string; userId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }
  const denied = adminOnly(auth);
  if (denied) {
    return denied;
  }

  const parsed = memberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid member access" }, { status: 400 });
  }

  const { id, userId } = await params;
  const repo = createMetadataRepository(getDatabase());
  if (!repo.getProjectById(id)) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }
  const user = repo.getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }
  if (user.role !== "member") {
    return NextResponse.json({ error: "owners and admins already see every project" }, { status: 400 });
  }

  repo.setProjectMember(id, userId, parsed.data.access);
  return NextResponse.json({ members: repo.listProjectMembers(id) });
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }
  const denied = adminOnly(auth);
  if (denied) {
    return denied;
  }

  const { id, userId } = await params;
  const repo = createMetadataRepository(getDatabase());
  repo.removeProjectMember(id, userId);
  return NextResponse.json({ members: repo.listProjectMembers(id) });
}
