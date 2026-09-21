import { NextResponse } from "next/server";
import { requireMaintenanceAuth } from "@/lib/server/auth/maintenance";
import { checkHealth, type HealthCheckResult } from "@/lib/server/health";

export async function GET(request: Request) {
  const health = await checkHealth();
  // Error text can carry absolute paths and the tool versions help fingerprint the host, so they
  // go only to a session or the maintenance token. The status code is all a container healthcheck reads.
  const detailed = (await requireMaintenanceAuth(request)).ok;

  return NextResponse.json(detailed ? detailedHealth(health) : anonymousHealth(health), {
    status: health.ok ? 200 : 503
  });
}

function anonymousHealth(health: HealthCheckResult) {
  return {
    ok: health.ok,
    checks: {
      storage: { ok: health.checks.storage.ok },
      database: { ok: health.checks.database.ok },
      previewTools: {
        ffmpeg: { ok: health.checks.previewTools.ffmpeg.ok },
        poppler: { ok: health.checks.previewTools.poppler.ok }
      }
    }
  };
}

function detailedHealth(health: HealthCheckResult) {
  return {
    ok: health.ok,
    checks: {
      storage: publicCheck(health.checks.storage),
      database: publicCheck(health.checks.database),
      previewTools: {
        ffmpeg: publicToolCheck(health.checks.previewTools.ffmpeg),
        poppler: publicToolCheck(health.checks.previewTools.poppler)
      }
    }
  };
}

function publicCheck(check: HealthCheckResult["checks"]["storage"]) {
  return check.ok ? { ok: true } : { ok: false, error: check.error ?? "readiness check failed" };
}

function publicToolCheck(check: HealthCheckResult["checks"]["previewTools"]["ffmpeg"]) {
  return check.ok
    ? { ok: true, version: check.version ?? null }
    : { ok: false, error: check.error ?? "readiness check failed" };
}
