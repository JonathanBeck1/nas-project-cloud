import { getDatabase } from "@/lib/server/db";
import { type AuditEventInput, type AuditFilters, createMetadataRepository } from "@/lib/server/metadata";
import { trustedClientIp } from "@/lib/server/rateLimit";
import { AUDIT_ACTIONS, type AuditAction, type AuditEvent } from "@/lib/shared/types";

export const AUDIT_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

// The IP is only known behind a trusted proxy; the app never sees the socket address otherwise.
// Called after the action has happened, so a failed write is logged rather than turning a success into a 500.
export function recordAudit(request: Request | null, event: Omit<AuditEventInput, "ip">): void {
  try {
    createMetadataRepository(getDatabase()).recordAuditEvent({
      ...event,
      ip: request ? trustedClientIp(request) : null
    });
  } catch (error) {
    console.error(`[audit] could not record ${event.action}`, error);
  }
}

export function pruneAuditLog(now = new Date()): number {
  return createMetadataRepository(getDatabase()).pruneAuditEvents(new Date(now.getTime() - AUDIT_RETENTION_MS));
}

export function fileTarget(file: { id: string; name: string }) {
  return { type: "file" as const, id: file.id, label: file.name };
}

export function projectLabel(repo: { getProjectById(id: string): { name: string } | null }, projectId: string | null): string {
  return projectId ? (repo.getProjectById(projectId)?.name ?? projectId) : "Inbox";
}

export const AUDIT_PAGE_SIZE = 100;

// Shared by the list and export routes; null means a parameter was malformed.
export function parseAuditFilters(params: URLSearchParams): Omit<AuditFilters, "limit"> | null {
  const action = params.get("action") || undefined;
  const from = params.get("from") || undefined;
  const to = params.get("to") || undefined;
  if (action && !(AUDIT_ACTIONS as readonly string[]).includes(action)) return null;
  if ((from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to)))) return null;
  const cursor = params.get("cursor") || null;
  if (cursor && !/^[^|]+\|audit_[\w-]+$/.test(cursor)) return null;
  return {
    userId: params.get("userId") || undefined,
    action: action as AuditAction | undefined,
    from: from && new Date(from).toISOString(),
    to: to && new Date(to).toISOString(),
    cursor
  };
}

const CSV_COLUMNS = ["Time", "Person", "Action", "Target type", "Target", "Target ID", "IP", "Detail"];

// A leading = + - @ makes spreadsheets run the cell as a formula, so those get a quote mark first.
function csvCell(value: string | null): string {
  const text = value ?? "";
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function auditCsvRow(event: AuditEvent): string {
  return [
    event.createdAt,
    event.userEmail ?? (event.userId ? event.userId : ""),
    event.action,
    event.targetType,
    event.targetLabel,
    event.targetId,
    event.ip,
    event.detail ? JSON.stringify(event.detail) : null
  ]
    .map(csvCell)
    .join(",");
}

export const AUDIT_CSV_HEADER = CSV_COLUMNS.map(csvCell).join(",");
