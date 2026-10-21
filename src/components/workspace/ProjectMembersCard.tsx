"use client";

import React, { useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { csrfHeaders } from "@/lib/client/csrf";
import type { ProjectAccess, ProjectMember, TeamMember } from "@/lib/shared/types";

const buttonClass =
  "inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink shadow-panel transition hover:border-muted disabled:cursor-not-allowed disabled:opacity-50";
const selectClass = "h-9 rounded-md border border-line bg-surface px-2 text-sm text-ink";

type ProjectMembersCardProps = {
  projectId: string;
  members: ProjectMember[];
  // Members only: owners and admins already see every project.
  people: TeamMember[];
};

export function ProjectMembersCard({ projectId, members: initialMembers, people }: ProjectMembersCardProps) {
  const [members, setMembers] = useState(initialMembers);
  const [newUserId, setNewUserId] = useState("");
  const [newAccess, setNewAccess] = useState<ProjectAccess>("view");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const candidates = people.filter((person) => !members.some((member) => member.userId === person.id));

  async function send(userId: string, method: "PATCH" | "DELETE", access?: ProjectAccess) {
    setIsBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/members/${userId}`, {
        method,
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: access ? JSON.stringify({ access }) : undefined
      });
      const body = (await response.json().catch(() => ({}))) as { members?: ProjectMember[]; error?: string };
      if (!response.ok || !body.members) throw new Error(body.error ?? `status ${response.status}`);
      setMembers(body.members);
      setNewUserId("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not update members");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-line bg-panel p-4 shadow-panel" aria-labelledby="project-members-heading">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-surface text-accent">
          <Users aria-hidden="true" className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 id="project-members-heading" className="text-sm font-semibold text-ink">
            Members
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            Members see this project only if they&apos;re listed here. Editors can upload, rename, move, archive and share;
            viewers can browse and download. Owners and admins see every project.
          </p>
        </div>
      </div>

      {members.length > 0 ? (
        <ul aria-label="Project members" className="mt-4 divide-y divide-line rounded-md border border-line bg-surface">
          {members.map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate text-sm font-medium text-ink">{member.name}</p>
                <p className="truncate text-xs text-muted">{member.email}</p>
              </div>
              <select
                aria-label={`Access for ${member.name}`}
                className={selectClass}
                disabled={isBusy}
                onChange={(event) => void send(member.userId, "PATCH", event.target.value as ProjectAccess)}
                value={member.access}
              >
                <option value="edit">Editor</option>
                <option value="view">Viewer</option>
              </select>
              <button className={buttonClass} disabled={isBusy} onClick={() => void send(member.userId, "DELETE")} type="button">
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-xs text-muted">No members yet. Only owners and admins can see this project.</p>
      )}

      {candidates.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select
            aria-label="Person to add"
            className={`${selectClass} min-w-0 flex-1 basis-48`}
            onChange={(event) => setNewUserId(event.target.value)}
            value={newUserId}
          >
            <option value="">Add a member…</option>
            {candidates.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} ({person.email})
              </option>
            ))}
          </select>
          <select
            aria-label="Access for the new member"
            className={selectClass}
            onChange={(event) => setNewAccess(event.target.value as ProjectAccess)}
            value={newAccess}
          >
            <option value="view">Viewer</option>
            <option value="edit">Editor</option>
          </select>
          <button
            className={buttonClass}
            disabled={isBusy || !newUserId}
            onClick={() => void send(newUserId, "PATCH", newAccess)}
            type="button"
          >
            <UserPlus aria-hidden="true" className="h-4 w-4" />
            Add
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-xs font-medium text-red-500">
          {error}
        </p>
      ) : null}
    </section>
  );
}
