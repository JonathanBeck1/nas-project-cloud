import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { AppDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { enqueuePreviewForFile } from "@/lib/server/previews/enqueue";
import { classifyFile } from "@/lib/shared/fileTypes";
import type { FileFamily, FileStatus } from "@/lib/shared/types";

export type ReconcileStorageInput = {
  db: AppDatabase;
  storageRoot: string;
  quietMs?: number;
  budgetMs?: number;
};

export type ReconcileStorageResult = {
  scanned: number;
  indexed: number;
  relinked: number;
  restored: number;
  missing: number;
  deferred: number;
};

type IndexedRow = {
  id: string;
  name: string;
  storagePath: string;
  status: FileStatus;
  archivedAt: string | null;
  checksum: string;
  sizeBytes: number;
};

const DEFAULT_QUIET_MS = 60_000;
const IGNORED_NAMES = new Set(["Thumbs.db", "desktop.ini"]);

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

export async function reconcileStorage(input: ReconcileStorageInput): Promise<ReconcileStorageResult> {
  const storageRoot = path.resolve(input.storageRoot);
  const quietMs = input.quietMs ?? DEFAULT_QUIET_MS;
  const repo = createMetadataRepository(input.db);
  const exists = input.db.prepare<[string], { id: string }>("select id from files where storage_path = ? limit 1");
  const projectBySlug = input.db.prepare<[string], { id: string }>("select id from projects where slug = ? limit 1");

  // Rows before disk: a file the app moves mid-pass then fails the storage_path condition instead of looking orphaned.
  const rows = input.db
    .prepare<[], IndexedRow>(
      `select id, name, storage_path as storagePath, status, archived_at as archivedAt,
              checksum, size_bytes as sizeBytes
         from files order by uploaded_at, id`
    )
    .all();

  const onDisk = new Set<string>();
  for await (const filePath of walkFiles(storageRoot)) {
    onDisk.add(toStoragePath(storageRoot, filePath));
  }

  // A locked or unmounted dataset looks like an empty tree.
  if (onDisk.size === 0 && rows.some((row) => row.status !== "missing")) {
    throw new Error("Storage root is empty or unavailable; refusing to mark every indexed file missing");
  }

  const result: ReconcileStorageResult = {
    scanned: onDisk.size,
    indexed: 0,
    relinked: 0,
    restored: 0,
    missing: 0,
    deferred: 0
  };

  const known = new Set<string>();
  const orphans = new Map<string, IndexedRow[]>();
  const orphanSizes = new Set<number>();
  for (const row of rows) {
    known.add(row.storagePath);
    if (!onDisk.has(row.storagePath)) {
      const key = contentKey(row.sizeBytes, row.checksum);
      orphans.set(key, [...(orphans.get(key) ?? []), row]);
      orphanSizes.add(row.sizeBytes);
    } else if (row.status === "missing") {
      const restored = repo.updateFile(
        row.id,
        { status: statusForStoragePath(row.storagePath) },
        { storagePath: row.storagePath, status: "missing" }
      );
      result.restored += restored ? 1 : 0;
    }
  }

  const candidates: { storagePath: string; absolutePath: string; sizeBytes: number; modifiedAt: Date }[] = [];
  // An orphan with the same size as a deferred file is probably that file mid-move, not a deletion.
  const deferredSizes = new Set<number>();
  const now = Date.now();
  for (const storagePath of onDisk) {
    if (known.has(storagePath)) {
      continue;
    }
    const absolutePath = path.join(storageRoot, storagePath);
    try {
      const stats = await fs.stat(absolutePath);
      // ctime, not mtime: link, rename, and write all bump it, and SMB clients cannot backdate it.
      if (quietMs > 0 && now - stats.ctimeMs < quietMs) {
        result.deferred += 1;
        deferredSizes.add(stats.size);
        continue;
      }
      candidates.push({ storagePath, absolutePath, sizeBytes: stats.size, modifiedAt: stats.mtime });
    } catch {
      result.deferred += 1;
    }
  }
  // Likely moves first, so a time budget spends itself on relinking before new files.
  candidates.sort(
    (a, b) =>
      Number(orphanSizes.has(b.sizeBytes)) - Number(orphanSizes.has(a.sizeBytes)) ||
      (a.storagePath < b.storagePath ? -1 : 1)
  );

  const deadline = input.budgetMs === undefined ? Infinity : Date.now() + input.budgetMs;
  let hashed = 0;
  for (const candidate of candidates) {
    if (hashed > 0 && Date.now() >= deadline) {
      result.deferred += 1;
      deferredSizes.add(candidate.sizeBytes);
      continue;
    }

    let checksum: string;
    try {
      checksum = await sha256File(candidate.absolutePath);
    } catch {
      result.deferred += 1;
      continue;
    }
    hashed += 1;

    // Hashing can take minutes; the app may have indexed this path meanwhile.
    if (exists.get(candidate.storagePath)) {
      continue;
    }

    const basename = path.posix.basename(candidate.storagePath);
    const classification = classifyFile(basename);
    const status = statusForStoragePath(candidate.storagePath);
    const slug = /^Projects\/([^/]+)\//.exec(candidate.storagePath)?.[1];
    const projectId = slug ? projectBySlug.get(slug)?.id : undefined;

    const matches = orphans.get(contentKey(candidate.sizeBytes, checksum));
    if (matches?.length) {
      const sameName = matches.findIndex((row) => row.name === basename);
      const [row] = matches.splice(Math.max(0, sameName), 1);
      const renamed = path.posix.basename(row.storagePath) !== basename;
      const relinked = repo.updateFile(
        row.id,
        {
          storagePath: candidate.storagePath,
          status,
          archivedAt: status === "archived" ? (row.archivedAt ?? candidate.modifiedAt.toISOString()) : null,
          ...(renamed ? { name: basename, extension: classification.extension, family: classification.family } : {}),
          ...(projectId ? { projectId } : {})
        },
        { storagePath: row.storagePath }
      );
      result.relinked += relinked ? 1 : 0;
      continue;
    }

    const file = repo.createFile({
      name: basename,
      extension: classification.extension,
      family: classification.family,
      mimeType: MIME_BY_EXTENSION[classification.extension] ?? "application/octet-stream",
      sizeBytes: candidate.sizeBytes,
      checksum,
      storagePath: candidate.storagePath,
      projectId,
      categoryId: categoryForStoragePath(candidate.storagePath, classification.family),
      sourceDevice: sourceDeviceForStoragePath(candidate.storagePath),
      status,
      archivedAt: status === "archived" ? candidate.modifiedAt.toISOString() : null
    });
    if (status === "active") {
      enqueuePreviewForFile(repo, file);
    }
    result.indexed += 1;
  }

  for (const row of [...orphans.values()].flat()) {
    if (row.status === "missing" || deferredSizes.has(row.sizeBytes)) {
      continue;
    }
    const marked = repo.updateFile(row.id, { status: "missing" }, { storagePath: row.storagePath, status: row.status });
    result.missing += marked ? 1 : 0;
  }

  return result;
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
    if (entry.name.startsWith(".") || entry.name.startsWith("~$") || IGNORED_NAMES.has(entry.name)) {
      continue;
    }
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

function categoryForStoragePath(storagePath: string, family: FileFamily): string | null {
  return storagePath.startsWith("Archive/") ? "cat_archive" : CATEGORY_BY_FAMILY[family] ?? null;
}

function statusForStoragePath(storagePath: string): FileStatus {
  return storagePath.startsWith("Archive/") ? "archived" : "active";
}

function contentKey(sizeBytes: number, checksum: string): string {
  return `${sizeBytes}:${checksum}`;
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
