import { NextResponse } from "next/server";
import type { createMetadataRepository } from "@/lib/server/metadata";
import type { ProjectAccess, UserRole } from "@/lib/shared/types";

export type Actor = { userId: string; role: UserRole };

type Repo = Pick<ReturnType<typeof createMetadataRepository>, "getProjectAccess">;

export function isAdmin(actor: Actor): boolean {
  return actor.role === "owner" || actor.role === "admin";
}

export function adminOnly(actor: Actor): NextResponse | null {
  return isAdmin(actor) ? null : NextResponse.json({ error: "admin access required" }, { status: 403 });
}

// Pass to listing queries: undefined for admins, who see everything.
export function visibleTo(actor: Actor): string | undefined {
  return isAdmin(actor) ? undefined : actor.userId;
}

export function projectAccess(repo: Repo, actor: Actor, projectId: string): ProjectAccess | null {
  return isAdmin(actor) ? "edit" : repo.getProjectAccess(projectId, actor.userId);
}

// A file outside every project belongs to whoever uploaded it.
export function fileAccess(
  repo: Repo,
  actor: Actor,
  file: { projectId: string | null; uploadedBy: string | null }
): ProjectAccess | null {
  if (isAdmin(actor)) return "edit";
  if (file.projectId) return repo.getProjectAccess(file.projectId, actor.userId);
  return file.uploadedBy === actor.userId ? "edit" : null;
}

// Out of reach reads exactly like missing, so ids can't be probed; view-only is a plain 403.
export function deniedResponse(access: ProjectAccess | null, need: ProjectAccess, notFound: string): NextResponse | null {
  if (!access) return NextResponse.json({ error: notFound }, { status: 404 });
  if (need === "edit" && access === "view") {
    return NextResponse.json({ error: "view-only access" }, { status: 403 });
  }
  return null;
}

export function fileDenied(
  repo: Repo,
  actor: Actor,
  file: { projectId: string | null; uploadedBy: string | null },
  need: ProjectAccess
): NextResponse | null {
  return deniedResponse(fileAccess(repo, actor, file), need, "file not found");
}

export function projectDenied(repo: Repo, actor: Actor, projectId: string, need: ProjectAccess): NextResponse | null {
  return deniedResponse(projectAccess(repo, actor, projectId), need, "project not found");
}

// Owners manage everyone and admins manage members. Nobody acts on their own account here,
// so the owner doing the managing always remains, and there is never a team without one.
export function canManageUser(actor: Actor, target: { id: string; role: UserRole }): boolean {
  if (actor.userId === target.id) return false;
  if (actor.role === "owner") return true;
  return actor.role === "admin" && target.role === "member";
}

export function canGrantRole(actor: Actor, role: UserRole): boolean {
  return actor.role === "owner" || (actor.role === "admin" && role === "member");
}
