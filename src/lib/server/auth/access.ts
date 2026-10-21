import { NextResponse } from "next/server";
import type { createMetadataRepository } from "@/lib/server/metadata";
import type { ProjectAccess, UserRole } from "@/lib/shared/types";

export type Actor = { userId: string; role: UserRole };

type FullRepo = ReturnType<typeof createMetadataRepository>;
type Repo = Pick<FullRepo, "getProjectAccess">;

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

// The client hides edit controls for files in these; the routes refuse the edits regardless.
export function viewOnlyProjectIds(repo: Pick<FullRepo, "listViewOnlyProjectIds">, actor: Actor): string[] {
  return isAdmin(actor) ? [] : repo.listViewOnlyProjectIds(actor.userId);
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

// Owners manage everyone, admins manage members, nobody manages themselves: so an owner always remains.
export function canManageUser(actor: Actor, target: { id: string; role: UserRole }): boolean {
  if (actor.userId === target.id) return false;
  if (actor.role === "owner") return true;
  return actor.role === "admin" && target.role === "member";
}

export function canGrantRole(actor: Actor, role: UserRole): boolean {
  return actor.role === "owner" || (actor.role === "admin" && role === "member");
}

// Read after the request's last await, right before the write, so two owners acting on each other at once can't both pass.
export function currentActor(repo: Pick<FullRepo, "getActiveRole">, actor: Actor): Actor | null {
  const role = repo.getActiveRole(actor.userId);
  return role ? { userId: actor.userId, role } : null;
}
