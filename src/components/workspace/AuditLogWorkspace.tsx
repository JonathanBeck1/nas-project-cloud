"use client";

import React, { useRef, useState } from "react";
import { Download, ScrollText } from "lucide-react";
import { AUDIT_ACTIONS, type AuditAction, type AuditEvent } from "@/lib/shared/types";

const fieldClass = "h-9 w-full rounded-md border border-line bg-surface px-2 text-sm text-ink";
const buttonClass =
  "inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink shadow-panel transition hover:border-muted disabled:cursor-not-allowed disabled:opacity-50";

const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  sign_in: "Signed in",
  sign_in_failed: "Failed sign-in",
  sign_out: "Signed out",
  account_created: "Account created",
  two_factor_enabled: "Two-factor turned on",
  recovery_codes_replaced: "Recovery codes replaced",
  two_factor_reset: "Two-factor reset",
  invite_created: "Invite created",
  invite_revoked: "Invite revoked",
  user_role_changed: "Role changed",
  user_disabled: "Account disabled",
  user_enabled: "Account enabled",
  user_removed: "Account removed",
  device_paired: "Device paired",
  device_removed: "Device removed",
  project_created: "Project created",
  project_updated: "Project edited",
  project_deleted: "Project deleted",
  project_member_set: "Project access set",
  project_member_removed: "Project access removed",
  file_uploaded: "File uploaded",
  file_downloaded: "File downloaded",
  files_downloaded: "Files downloaded as ZIP",
  project_downloaded: "Project downloaded as ZIP",
  file_renamed: "File renamed",
  file_moved: "File moved",
  file_archived: "File archived",
  file_restored: "File restored",
  file_deleted: "File deleted",
  share_created: "Share link created",
  share_updated: "Share link edited",
  share_revoked: "Share link revoked",
  audit_exported: "Audit log exported"
};

type Page = { events: AuditEvent[]; nextCursor: string | null };
type Person = { id: string; name: string; email: string };
type Filters = { userId: string; action: string; from: string; to: string };

// Dates are picked in the viewer's time zone; "to" includes the whole day.
function filterQuery(filters: Filters, cursor?: string | null): string {
  const params = new URLSearchParams();
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.action) params.set("action", filters.action);
  if (filters.from) params.set("from", new Date(`${filters.from}T00:00`).toISOString());
  if (filters.to) {
    const end = new Date(`${filters.to}T00:00`);
    end.setDate(end.getDate() + 1);
    params.set("to", end.toISOString());
  }
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

function describeDetail(detail: AuditEvent["detail"]): string {
  if (!detail) return "";
  return Object.entries(detail)
    .filter(([, value]) => value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0))
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
    .join(" · ");
}

export function AuditLogWorkspace({ initial, people }: { initial: Page; people: Person[] }) {
  const [filters, setFilters] = useState<Filters>({ userId: "", action: "", from: "", to: "" });
  const [events, setEvents] = useState(initial.events);
  const [nextCursor, setNextCursor] = useState(initial.nextCursor);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  // Only the newest request may update the list, so a slow answer for old filters can't land last.
  const latestRequest = useRef(0);

  async function load(next: Filters, cursor?: string | null) {
    const requestId = ++latestRequest.current;
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/audit?${filterQuery(next, cursor)}`);
      const body = (await response.json().catch(() => ({}))) as Partial<Page> & { error?: string };
      if (requestId !== latestRequest.current) return;
      if (!response.ok) throw new Error(body.error ?? `status ${response.status}`);
      setEvents((current) => (cursor ? [...current, ...(body.events ?? [])] : (body.events ?? [])));
      setNextCursor(body.nextCursor ?? null);
    } catch (loadError) {
      if (requestId === latestRequest.current) {
        setError(loadError instanceof Error ? loadError.message : "Could not load the audit log");
      }
    } finally {
      if (requestId === latestRequest.current) setIsLoading(false);
    }
  }

  const change = (key: keyof Filters, value: string) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    void load(next);
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <section className="rounded-md border border-line bg-panel px-4 py-4 shadow-panel">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-surface text-accent">
            <ScrollText aria-hidden="true" className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">System</p>
            <h1 className="mt-1 text-2xl font-semibold text-ink">Audit log</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Sign-ins, account and access changes, and what happened to files and share links, kept for 365 days.
              Previews and thumbnails aren&apos;t recorded. IP addresses appear only when the app runs behind a trusted
              proxy.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-line bg-panel p-4 shadow-panel" aria-label="Audit log filters">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto] lg:items-end">
          <label className="text-xs font-semibold text-muted">
            Person
            <select className={`mt-1 ${fieldClass}`} value={filters.userId} onChange={(event) => change("userId", event.target.value)}>
              <option value="">Everyone</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} ({person.email})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">
            Action
            <select className={`mt-1 ${fieldClass}`} value={filters.action} onChange={(event) => change("action", event.target.value)}>
              <option value="">All actions</option>
              {AUDIT_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {AUDIT_ACTION_LABELS[action]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">
            From
            <input className={`mt-1 ${fieldClass}`} type="date" value={filters.from} onChange={(event) => change("from", event.target.value)} />
          </label>
          <label className="text-xs font-semibold text-muted">
            To
            <input className={`mt-1 ${fieldClass}`} type="date" value={filters.to} onChange={(event) => change("to", event.target.value)} />
          </label>
          <a className={buttonClass} href={`/api/audit/export?${filterQuery(filters)}`}>
            <Download aria-hidden="true" className="h-4 w-4" />
            Export CSV
          </a>
        </div>
      </section>

      {error ? (
        <p role="alert" className="text-sm font-medium text-red-500">
          {error}
        </p>
      ) : null}

      <section className="rounded-md border border-line bg-panel shadow-panel">
        {events.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">{isLoading ? "Loading…" : "Nothing recorded for these filters."}</p>
        ) : (
          <ul aria-label="Audit entries" className="divide-y divide-line">
            {events.map((event) => {
              const detail = describeDetail(event.detail);
              return (
                <li key={event.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <time className="shrink-0 text-xs tabular-nums text-muted sm:w-44" dateTime={event.createdAt}>
                    {new Date(event.createdAt).toLocaleString()}
                  </time>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">
                      <span className="font-semibold">{AUDIT_ACTION_LABELS[event.action] ?? event.action}</span>
                      {event.targetLabel ? <span className="break-words"> · {event.targetLabel}</span> : null}
                    </p>
                    <p className="break-words text-xs text-muted">
                      {event.userEmail ?? "no signed-in person"}
                      {event.ip ? ` · ${event.ip}` : ""}
                      {detail ? ` · ${detail}` : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {nextCursor ? (
        <div className="flex justify-center">
          <button className={buttonClass} disabled={isLoading} onClick={() => void load(filters, nextCursor)} type="button">
            {isLoading ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
