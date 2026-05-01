import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { appConfig } from "./config";

export type UploadTarget =
  | { kind: "inbox"; sourceDevice: string }
  | { kind: "project"; projectSlug: string };

export type WriteUploadInput = {
  target: UploadTarget;
  filename: string;
  mimeType: string;
  bytes: Buffer;
};

export type MoveToProjectInput = {
  currentRelativePath: string;
  projectSlug: string;
  filename: string;
};

export type ArchiveFileInput = {
  currentRelativePath: string;
  filename: string;
  now?: Date;
};

export type RestoreFileInput = {
  currentRelativePath: string;
  targetRelativePath: string;
};

export type StoredFile = {
  absolutePath: string;
  relativePath: string;
  sizeBytes: number;
  checksum: string;
  mimeType: string;
};

export type AppendUploadChunkInput = {
  tempRelativePath: string;
  offset: number;
  bytes: Buffer;
};

export type CompleteUploadSessionInput = {
  tempRelativePath: string;
  target: UploadTarget;
  filename: string;
  mimeType: string;
};

export function createStorageService(root = appConfig.storageRoot) {
  const storageRoot = path.resolve(root);
  const absolutePathFor = (relativePath: string) => {
    const absolutePath = path.resolve(storageRoot, relativePath);
    const resolvedRelativePath = path.relative(storageRoot, absolutePath);
    if (resolvedRelativePath.startsWith("..") || path.isAbsolute(resolvedRelativePath)) {
      throw new Error("Storage path escapes configured root");
    }
    return absolutePath;
  };

  return {
    async writeUpload(input: WriteUploadInput): Promise<StoredFile> {
      const safeName = sanitizeFilename(input.filename);
      const relativeDirectory = targetDirectory(input.target);
      const absoluteDirectory = path.join(storageRoot, relativeDirectory);
      await fs.mkdir(absoluteDirectory, { recursive: true });

      const absolutePath = await nextAvailablePath(absoluteDirectory, safeName);
      await fs.writeFile(absolutePath, input.bytes, { flag: "wx" });

      const relativePath = path.relative(storageRoot, absolutePath).split(path.sep).join("/");
      return {
        absolutePath,
        relativePath,
        sizeBytes: input.bytes.length,
        checksum: sha256(input.bytes),
        mimeType: input.mimeType || "application/octet-stream"
      };
    },

    absolutePathFor,

    async createUploadTempPath(sessionId: string): Promise<{ absolutePath: string; relativePath: string }> {
      const relativePath = path.join(".uploads", `${sanitizePathSegment(sessionId)}.part`);
      const absolutePath = absolutePathFor(relativePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, Buffer.alloc(0), { flag: "wx" });
      return {
        absolutePath,
        relativePath: relativePath.split(path.sep).join("/")
      };
    },

    async appendUploadChunk(input: AppendUploadChunkInput): Promise<{ receivedBytes: number }> {
      const absolutePath = absolutePathFor(input.tempRelativePath);
      const stats = await fs.stat(absolutePath);
      if (!stats.isFile()) {
        throw new Error("Upload temp path is not a file");
      }

      if (stats.size !== input.offset) {
        throw new Error("Upload chunk offset mismatch");
      }

      await fs.writeFile(absolutePath, input.bytes, { flag: "a" });
      return { receivedBytes: stats.size + input.bytes.length };
    },

    async completeUploadSession(input: CompleteUploadSessionInput): Promise<StoredFile> {
      const from = absolutePathFor(input.tempRelativePath);
      const relativeDirectory = targetDirectory(input.target);
      const directory = path.join(storageRoot, relativeDirectory);
      const absolutePath = await moveIntoDirectory({
        storageRoot,
        from,
        directory,
        filename: input.filename
      });
      const stats = await fs.stat(absolutePath.absolutePath);

      return {
        ...absolutePath,
        sizeBytes: stats.size,
        checksum: await sha256File(absolutePath.absolutePath),
        mimeType: input.mimeType || "application/octet-stream"
      };
    },

    async fileDetails(relativePath: string) {
      const absolutePath = absolutePathFor(relativePath);
      const stats = await fs.stat(absolutePath);
      if (!stats.isFile()) {
        throw new Error("Storage path is not a file");
      }
      return {
        absolutePath,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString()
      };
    },

    async moveToProject(
      input: MoveToProjectInput
    ): Promise<{ absolutePath: string; relativePath: string }> {
      const from = absolutePathFor(input.currentRelativePath);
      const directory = path.join(
        storageRoot,
        "Projects",
        sanitizePathSegment(input.projectSlug),
        "Inbox"
      );
      return moveIntoDirectory({
        storageRoot,
        from,
        directory,
        filename: input.filename
      });
    },

    async archiveFile(
      input: ArchiveFileInput
    ): Promise<{ absolutePath: string; relativePath: string }> {
      const now = input.now ?? new Date();
      const from = absolutePathFor(input.currentRelativePath);
      const year = String(now.getUTCFullYear());
      const month = String(now.getUTCMonth() + 1).padStart(2, "0");
      const directory = path.join(storageRoot, "Archive", year, month);
      return moveIntoDirectory({
        storageRoot,
        from,
        directory,
        filename: input.filename
      });
    },

    async restoreFile(
      input: RestoreFileInput
    ): Promise<{ absolutePath: string; relativePath: string }> {
      const from = absolutePathFor(input.currentRelativePath);
      const to = absolutePathFor(input.targetRelativePath);
      await fs.mkdir(path.dirname(to), { recursive: true });
      await linkFile(from, to);
      return {
        absolutePath: to,
        relativePath: path.relative(storageRoot, to).split(path.sep).join("/")
      };
    },

    async deleteFile(relativePath: string): Promise<void> {
      await fs.unlink(absolutePathFor(relativePath));
    },

    async abortUploadSession(tempRelativePath: string): Promise<void> {
      await fs.unlink(absolutePathFor(tempRelativePath));
    }
  };
}

function targetDirectory(target: UploadTarget): string {
  if (target.kind === "inbox") {
    return path.join("Inbox", sanitizePathSegment(target.sourceDevice));
  }

  return path.join("Projects", sanitizePathSegment(target.projectSlug), "Inbox");
}

function sanitizeFilename(filename: string): string {
  const base = path.basename(filename).replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").trim();
  return base.length > 0 ? base : "upload.bin";
}

function sanitizePathSegment(segment: string): string {
  const safeSegment = segment.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").trim();
  return safeSegment === "" || safeSegment === "." || safeSegment === ".."
    ? "unknown-device"
    : safeSegment;
}

async function nextAvailablePath(directory: string, filename: string): Promise<string> {
  const parsed = path.parse(filename);
  for (let index = 1; index < 10_000; index += 1) {
    const candidateName = index === 1 ? filename : `${parsed.name}-${index}${parsed.ext}`;
    const candidatePath = path.join(directory, candidateName);
    try {
      await fs.access(candidatePath);
    } catch {
      return candidatePath;
    }
  }

  throw new Error(`Could not allocate filename for ${filename}`);
}

async function moveIntoDirectory(input: {
  storageRoot: string;
  from: string;
  directory: string;
  filename: string;
}): Promise<{ absolutePath: string; relativePath: string }> {
  await fs.mkdir(input.directory, { recursive: true });
  const absolutePath = await linkIntoAvailablePath(
    input.directory,
    sanitizeFilename(input.filename),
    input.from
  );
  return {
    absolutePath,
    relativePath: path.relative(input.storageRoot, absolutePath).split(path.sep).join("/")
  };
}

async function linkIntoAvailablePath(
  directory: string,
  filename: string,
  from: string
): Promise<string> {
  const parsed = path.parse(filename);
  for (let index = 1; index < 10_000; index += 1) {
    const candidateName = index === 1 ? filename : `${parsed.name}-${index}${parsed.ext}`;
    const candidatePath = path.join(directory, candidateName);
    try {
      await fs.link(from, candidatePath);
      try {
        await fs.unlink(from);
      } catch (error) {
        await fs.unlink(candidatePath).catch(() => undefined);
        throw error;
      }
      return candidatePath;
    } catch (error) {
      if (isNodeError(error) && error.code === "EEXIST") {
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Could not allocate filename for ${filename}`);
}

async function linkFile(from: string, to: string): Promise<void> {
  await fs.link(from, to);
  try {
    await fs.unlink(from);
  } catch (error) {
    await fs.unlink(to).catch(() => undefined);
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function sha256(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function sha256File(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}
