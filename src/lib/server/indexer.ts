import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { AppDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { classifyFile } from "@/lib/shared/fileTypes";
import type { FileFamily } from "@/lib/shared/types";

export type ScanStorageRootInput = {
  db: AppDatabase;
  storageRoot: string;
};

export type ScanStorageRootResult = {
  scanned: number;
  indexed: number;
};

const CATEGORY_BY_FAMILY: Partial<Record<FileFamily, string>> = {
  cad: "cat_cad",
  image: "cat_media",
  video: "cat_media",
  document: "cat_documents",
  software: "cat_software",
  archive: "cat_archive"
};

const MIME_BY_EXTENSION: Record<string, string> = {
  "3mf": "model/3mf",
  stl: "model/stl",
  step: "model/step",
  stp: "model/step",
  obj: "model/obj",
  f3d: "application/octet-stream",
  blend: "application/octet-stream",
  gcode: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  tiff: "image/tiff",
  tif: "image/tiff",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  svg: "image/svg+xml",
  webm: "video/webm",
  mp4: "video/mp4",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  m4v: "video/x-m4v",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  zip: "application/zip",
  "7z": "application/x-7z-compressed",
  rar: "application/vnd.rar",
  tar: "application/x-tar",
  gz: "application/gzip",
  dmg: "application/x-apple-diskimage",
  exe: "application/vnd.microsoft.portable-executable",
  msi: "application/x-msdownload",
  pkg: "application/octet-stream",
  appimage: "application/octet-stream"
};

export async function scanStorageRoot(input: ScanStorageRootInput): Promise<ScanStorageRootResult> {
  const storageRoot = path.resolve(input.storageRoot);
  const repo = createMetadataRepository(input.db);
  const exists = input.db.prepare<[string], { id: string }>("select id from files where storage_path = ? limit 1");
  let scanned = 0;
  let indexed = 0;

  for await (const filePath of walkFiles(storageRoot)) {
    scanned += 1;
    const storagePath = toStoragePath(storageRoot, filePath);
    if (exists.get(storagePath)) {
      continue;
    }

    const stats = await fs.stat(filePath);
    const classification = classifyFile(path.basename(filePath));
    repo.createFile({
      name: path.basename(filePath),
      extension: classification.extension,
      family: classification.family,
      mimeType: MIME_BY_EXTENSION[classification.extension] ?? "application/octet-stream",
      sizeBytes: stats.size,
      checksum: await sha256File(filePath),
      storagePath,
      categoryId: CATEGORY_BY_FAMILY[classification.family] ?? null,
      sourceDevice: sourceDeviceForStoragePath(storagePath)
    });
    indexed += 1;
  }

  return { scanned, indexed };
}

async function* walkFiles(directory: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(entryPath);
    } else if (entry.isFile()) {
      yield entryPath;
    }
  }
}

function toStoragePath(storageRoot: string, filePath: string): string {
  return path.relative(storageRoot, filePath).split(path.sep).join("/");
}

function sourceDeviceForStoragePath(storagePath: string): string {
  const [topLevel, device] = storagePath.split("/");
  return topLevel === "Inbox" && device ? device : "NAS";
}

async function sha256File(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
