import { NextResponse } from "next/server";
import { checkHealth, type HealthCheckResult } from "@/lib/server/health";

export async function GET() {
  const health = await checkHealth();

  return NextResponse.json(publicHealth(health), {
    status: health.ok ? 200 : 503
  });
}

function publicHealth(health: HealthCheckResult) {
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
