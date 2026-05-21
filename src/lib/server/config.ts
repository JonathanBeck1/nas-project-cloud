import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  NAS_CLOUD_STORAGE_ROOT: z.string().min(1).default(".data/storage"),
  NAS_CLOUD_DB_PATH: z.string().min(1).default(".data/nas-cloud.sqlite"),
  NAS_CLOUD_PUBLIC_BASE_PATH: z.string().min(1).default("/files"),
  NAS_CLOUD_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(2_147_483_648),
  NAS_CLOUD_PREVIEW_SCHEDULER: z
    .union([z.literal("on"), z.literal("off")])
    .default("off")
});

export type AppConfig = {
  storageRoot: string;
  dbPath: string;
  publicBasePath: string;
  maxUploadBytes: number;
  previewScheduler: "on" | "off";
};

export function resolveAppConfig(env: Partial<NodeJS.ProcessEnv> = process.env): AppConfig {
  const parsed = envSchema.parse(env);

  return {
    storageRoot: path.resolve(parsed.NAS_CLOUD_STORAGE_ROOT),
    dbPath: path.resolve(parsed.NAS_CLOUD_DB_PATH),
    publicBasePath: parsed.NAS_CLOUD_PUBLIC_BASE_PATH,
    maxUploadBytes: parsed.NAS_CLOUD_MAX_UPLOAD_BYTES,
    previewScheduler: parsed.NAS_CLOUD_PREVIEW_SCHEDULER
  };
}

let cached: AppConfig | undefined;

/**
 * Validate and return the application config. The first call resolves
 * and caches the result so a missing or malformed env var only fails
 * the first request that needs it, instead of crashing the module
 * import (which makes test isolation and DI awkward).
 */
export function getAppConfig(): AppConfig {
  if (!cached) {
    cached = resolveAppConfig();
  }
  return cached;
}

/** For tests: drop the cached config so the next call re-reads process.env. */
export function resetAppConfigForTesting(): void {
  cached = undefined;
}

/**
 * Lazy proxy preserved for ergonomics — existing callers can still
 * `import { appConfig } from "./config"` and read `appConfig.storageRoot`,
 * and the env will only be validated on first property access.
 */
export const appConfig: AppConfig = new Proxy({} as AppConfig, {
  get(_target, prop) {
    const config = getAppConfig();
    return config[prop as keyof AppConfig];
  }
});
