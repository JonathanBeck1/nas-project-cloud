import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiSession } from "./guards";

const MAINTENANCE_ENV_VAR = "NAS_CLOUD_MAINTENANCE_TOKEN";

export type MaintenanceAuthResult =
  | { ok: true; via: "session" | "token"; userId?: string }
  | { ok: false; response: NextResponse };

/**
 * Allow either a logged-in session OR a Bearer token matching the
 * NAS_CLOUD_MAINTENANCE_TOKEN env var. The token branch lets a TrueNAS
 * cron job hit /api/maintenance/* without a browser session.
 */
export async function requireMaintenanceAuth(request: Request): Promise<MaintenanceAuthResult> {
  const tokenResult = checkBearerToken(request);
  if (tokenResult === "match") {
    return { ok: true, via: "token" };
  }
  if (tokenResult === "mismatch") {
    return {
      ok: false,
      response: NextResponse.json({ error: "invalid maintenance token" }, { status: 401 })
    };
  }

  const session = await requireApiSession(request);
  if (!session.ok) {
    return { ok: false, response: session.response };
  }

  return { ok: true, via: "session", userId: session.userId };
}

function checkBearerToken(request: Request): "match" | "mismatch" | "absent" {
  const expected = process.env[MAINTENANCE_ENV_VAR];
  if (!expected || expected.length === 0) {
    return "absent";
  }

  const header = request.headers.get("authorization");
  if (!header) {
    return "absent";
  }

  const match = /^bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    return "absent";
  }

  const candidate = match[1].trim();
  if (candidate.length !== expected.length) {
    return "mismatch";
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected)) ? "match" : "mismatch";
  } catch {
    return "mismatch";
  }
}
