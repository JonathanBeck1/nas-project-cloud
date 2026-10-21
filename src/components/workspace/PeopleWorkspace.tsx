"use client";

import React, { useState } from "react";
import { Link2, Users } from "lucide-react";
import { csrfHeaders } from "@/lib/client/csrf";
import type { PendingInvite, TeamMember, UserRole } from "@/lib/shared/types";

const buttonClass =
  "inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink shadow-panel transition hover:border-muted disabled:cursor-not-allowed disabled:opacity-50";
const selectClass = "h-9 rounded-md border border-line bg-surface px-2 text-sm text-ink";
const roleLabels: Record<UserRole, string> = { owner: "Owner", admin: "Admin", member: "Member" };

type PeopleWorkspaceProps = {
  people: TeamMember[];
  invites: PendingInvite[];
  viewer: { id: string; role: UserRole };
};

// Mirrors the server's rules so the page only offers what will be allowed.
function canManage(viewer: PeopleWorkspaceProps["viewer"], person: TeamMember) {
  if (viewer.id === person.id) return false;
  return viewer.role === "owner" || (viewer.role === "admin" && person.role === "member");
}

function grantableRoles(viewer: PeopleWorkspaceProps["viewer"]): UserRole[] {
  return viewer.role === "owner" ? ["member", "admin", "owner"] : ["member"];
}

export function PeopleWorkspace({ people: initialPeople, invites: initialInvites, viewer }: PeopleWorkspaceProps) {
  const [people, setPeople] = useState(initialPeople);
  const [invites, setInvites] = useState(initialInvites);
  const [inviteRole, setInviteRole] = useState<UserRole>("member");
  const [inviteLink, setInviteLink] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  async function request<T>(url: string, method: string, body?: unknown): Promise<T> {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const json = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(json.error ?? `status ${response.status}`);
    return json;
  }

  async function run(action: () => Promise<void>, done?: string) {
    setIsBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      if (done) setMessage(done);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Something went wrong");
    } finally {
      setIsBusy(false);
    }
  }

  const refreshPeople = async () => setPeople((await request<{ users: TeamMember[] }>("/api/users", "GET")).users);

  const createInvite = () =>
    run(async () => {
      const created = await request<{ invite: PendingInvite; path: string }>("/api/invites", "POST", { role: inviteRole });
      setInviteLink(`${window.location.origin}${created.path}`);
      setInvites((current) => [created.invite, ...current]);
    });

  const revokeInvite = (invite: PendingInvite) =>
    run(async () => {
      await request(`/api/invites/${invite.id}`, "DELETE");
      setInvites((current) => current.filter((entry) => entry.id !== invite.id));
    }, "Invite revoked.");

  const changeRole = (person: TeamMember, role: UserRole) =>
    run(async () => {
      await request(`/api/users/${person.id}`, "PATCH", { role });
      await refreshPeople();
    }, `${person.name} is now ${roleLabels[role].toLowerCase()}.`);

  const setDisabled = (person: TeamMember, disabled: boolean) =>
    run(async () => {
      await request(`/api/users/${person.id}`, "PATCH", { disabled });
      await refreshPeople();
    }, disabled ? `${person.name} is disabled, signed out everywhere, and their share links stopped working.` : `${person.name} can sign in again.`);

  const resetTwoFactor = (person: TeamMember) => {
    if (!window.confirm(`Reset two-factor for ${person.name}? They're signed out and set it up again at their next sign-in.`)) return;
    void run(async () => {
      await request(`/api/users/${person.id}/two-factor-reset`, "POST");
      await refreshPeople();
    }, `Two-factor reset for ${person.name}.`);
  };

  const remove = (person: TeamMember) => {
    if (!window.confirm(`Remove ${person.name}? Their files stay, and files they kept outside any project become visible to admins only. Their share links stop working.`)) return;
    void run(async () => {
      await request(`/api/users/${person.id}`, "DELETE");
      setPeople((current) => current.filter((entry) => entry.id !== person.id));
    }, `${person.name} was removed.`);
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <section className="rounded-md border border-line bg-panel px-4 py-4 shadow-panel">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-surface text-accent">
            <Users aria-hidden="true" className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">System</p>
            <h1 className="mt-1 text-2xl font-semibold text-ink">People</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Owners and admins see every project. Members see only the projects they&apos;re added to, from each
              project&apos;s Members card, plus their own uploads. Everyone signs in with two-factor.
            </p>
          </div>
        </div>
      </section>

      {message ? (
        <p role="status" className="text-sm font-medium text-accent">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-red-500">
          {error}
        </p>
      ) : null}

      <section className="rounded-md border border-line bg-panel p-4 shadow-panel" aria-labelledby="invite-heading">
        <h2 id="invite-heading" className="text-sm font-semibold text-ink">
          Invite someone
        </h2>
        <p className="mt-1 text-xs leading-5 text-muted">
          Creates a one-time link that works for 7 days. The person sets their own email and password, then two-factor.
          Send it privately: anyone with the link can use it.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            aria-label="Role for the invite"
            className={selectClass}
            onChange={(event) => setInviteRole(event.target.value as UserRole)}
            value={inviteRole}
          >
            {grantableRoles(viewer).map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
          <button className={buttonClass} disabled={isBusy} onClick={() => void createInvite()} type="button">
            <Link2 aria-hidden="true" className="h-4 w-4" />
            Create invite link
          </button>
        </div>
        {inviteLink ? (
          <div className="mt-3">
            <p className="text-xs text-muted">Copy this now; it won&apos;t be shown again.</p>
            <p
              className="mt-1 select-all break-all rounded-md border border-line bg-surface px-3 py-2 font-mono text-xs text-ink"
              data-testid="invite-link"
            >
              {inviteLink}
            </p>
          </div>
        ) : null}

        {invites.length > 0 ? (
          <ul aria-label="Pending invites" className="mt-4 divide-y divide-line rounded-md border border-line bg-surface">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="font-medium text-ink">{roleLabels[invite.role]} invite</span>
                <span className="flex-1 text-xs text-muted">expires {new Date(invite.expiresAt).toLocaleDateString()}</span>
                {grantableRoles(viewer).includes(invite.role) ? (
                  <button className={buttonClass} disabled={isBusy} onClick={() => void revokeInvite(invite)} type="button">
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-md border border-line bg-panel p-4 shadow-panel" aria-labelledby="people-heading">
        <h2 id="people-heading" className="text-sm font-semibold text-ink">
          Accounts
        </h2>
        <ul aria-label="Accounts" className="mt-3 divide-y divide-line rounded-md border border-line bg-surface">
          {people.map((person) => {
            const manageable = canManage(viewer, person);
            return (
              <li key={person.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate text-sm font-medium text-ink">
                    {person.name}
                    {person.id === viewer.id ? <span className="font-normal text-muted"> (you)</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {person.email} · {person.disabled ? "disabled" : person.twoFactorEnabled ? "two-factor on" : "two-factor not set up"}
                    {person.lastSeenAt ? ` · last seen ${new Date(person.lastSeenAt).toLocaleDateString()}` : ""}
                  </p>
                </div>
                {manageable ? (
                  <>
                    <select
                      aria-label={`Role for ${person.name}`}
                      className={selectClass}
                      disabled={isBusy}
                      onChange={(event) => void changeRole(person, event.target.value as UserRole)}
                      value={person.role}
                    >
                      {[...new Set<UserRole>([person.role, ...grantableRoles(viewer)])].map((role) => (
                        <option key={role} value={role}>
                          {roleLabels[role]}
                        </option>
                      ))}
                    </select>
                    <button
                      className={buttonClass}
                      disabled={isBusy}
                      onClick={() => void setDisabled(person, !person.disabled)}
                      type="button"
                    >
                      {person.disabled ? "Enable" : "Disable"}
                    </button>
                    <button className={buttonClass} disabled={isBusy} onClick={() => resetTwoFactor(person)} type="button">
                      Reset two-factor
                    </button>
                    <button className={buttonClass} disabled={isBusy} onClick={() => remove(person)} type="button">
                      Remove
                    </button>
                  </>
                ) : (
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{roleLabels[person.role]}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
