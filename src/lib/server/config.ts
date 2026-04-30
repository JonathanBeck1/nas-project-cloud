import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  NAS_CLOUD_STORAGE_ROOT: z.string().min(1).default(".data/storage"),
  NAS_CLOUD_DB_PATH: z.string().min(1).default(".data/nas-cloud.sqlite"),
  NAS_CLOUD_PUBLIC_BASE_PATH: z.string().min(1).default("/files"),
  NAS_CLOUD_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(2_147_483_648)
});

export type AppConfig = {
  storageRoot: string;
  dbPath: string;
  publicBasePath: string;
  maxUploadBytes: number;
};

export function resolveAppConfig(env: Partial<NodeJS.ProcessEnv> = process.env): AppConfig {
  const parsed = envSchema.parse(env);

  return {
    storageRoot: path.resolve(parsed.NAS_CLOUD_STORAGE_ROOT),
    dbPath: path.resolve(parsed.NAS_CLOUD_DB_PATH),
    publicBasePath: parsed.NAS_CLOUD_PUBLIC_BASE_PATH,
    maxUploadBytes: parsed.NAS_CLOUD_MAX_UPLOAD_BYTES
  };
}

export const appConfig = resolveAppConfig();
