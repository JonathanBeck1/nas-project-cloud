import fs from "node:fs/promises";
import path from "node:path";
import { appConfig, type AppConfig } from "./config";
import { getDatabase, type AppDatabase } from "./db";
import { probeFfmpeg, type FfmpegProbeResult } from "./previews/ffmpeg";
import { probePoppler, type PopplerProbeResult } from "./previews/poppler";

export type HealthCheck = {
  ok: boolean;
  path: string;
  error?: string;
};

export type ToolHealthCheck = {
  ok: boolean;
  name: string;
  version?: string;
  error?: string;
};

export type HealthCheckResult = {
  ok: boolean;
  checks: {
    storage: HealthCheck;
    database: HealthCheck;
    previewTools: {
      ffmpeg: ToolHealthCheck;
      poppler: ToolHealthCheck;
    };
  };
};

type HealthCheckOptions = {
  config?: AppConfig;
  db?: AppDatabase;
  probes?: {
    ffmpeg?: () => Promise<FfmpegProbeResult>;
    poppler?: () => Promise<PopplerProbeResult>;
  };
};

export async function checkHealth(options: HealthCheckOptions = {}): Promise<HealthCheckResult> {
  const config = options.config ?? appConfig;
  const db = options.db ?? getDatabase();
  const ffmpegProbe = options.probes?.ffmpeg ?? probeFfmpeg;
  const popplerProbe = options.probes?.poppler ?? probePoppler;
  const [storage, database, ffmpeg, poppler] = await Promise.all([
    checkStorage(config.storageRoot),
    checkDatabase(config.dbPath, db),
    checkPreviewTool("ffmpeg", ffmpegProbe()),
    checkPreviewTool("pdftoppm", popplerProbe())
  ]);

  return {
    ok: storage.ok && database.ok && ffmpeg.ok && poppler.ok,
    checks: {
      storage,
      database,
      previewTools: {
        ffmpeg,
        poppler
      }
    }
  };
}

async function checkStorage(storageRoot: string): Promise<HealthCheck> {
  const probePath = path.join(storageRoot, ".nas-cloud-healthcheck");

  try {
    await fs.access(storageRoot);
    await fs.writeFile(probePath, `ok ${new Date().toISOString()}\n`);
    await fs.rm(probePath, { force: true });
    return { ok: true, path: storageRoot };
  } catch (error) {
    await fs.rm(probePath, { force: true }).catch(() => undefined);
    return { ok: false, path: storageRoot, error: errorMessage(error) };
  }
}

function checkDatabase(dbPath: string, db: AppDatabase): HealthCheck {
  try {
    const result = db.prepare("select 1 as ok").get() as { ok?: number } | undefined;
    if (result?.ok !== 1) {
      return { ok: false, path: dbPath, error: "database readiness query returned an unexpected result" };
    }

    return { ok: true, path: dbPath };
  } catch (error) {
    return { ok: false, path: dbPath, error: errorMessage(error) };
  }
}

async function checkPreviewTool(
  name: string,
  probe: Promise<FfmpegProbeResult | PopplerProbeResult>
): Promise<ToolHealthCheck> {
  const result = await probe;
  return result.available
    ? { ok: true, name, version: result.version }
    : { ok: false, name, error: result.error ?? `${name} is unavailable` };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "unknown readiness error";
}
