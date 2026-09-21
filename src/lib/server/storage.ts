import crypto from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
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

export type StreamUploadInput = {
  target: UploadTarget;
  filename: string;
  relativePath?: string;
  mimeType: string;
  body: ReadableStream<Uint8Array> | NodeJS.ReadableStream;
  maxBytes: number;
};

export type MoveToProjectInput = {
  currentRelativePath: string;
  projectSlug: string;
  filename: string;
};

export type MoveToInboxInput = {
  currentRelativePath: string;
  sourceDevice: string;
  filename: string;
};

export type RenameFileInput = {
  currentRelativePath: string;
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
  relativePath?: string | null;
  mimeType: string;
  sizeBytes: number;
};

export function createStorageService(root = appConfig.storageRoot) {
  const storageRoot = path.resolve(root);
  const absolutePathFor = (relativePath: string) => {
    const absolutePath = path.resolve(storageRoot, relativePath);
    if (escapesRoot(storageRoot, absolutePath)) {
      throw new Error("Storage path escapes configured root");
    }
    return absolutePath;
  };
  // absolutePathFor is lexical. Anything that opens a file for reading goes through this, because a symlink
  // dropped in over SMB could otherwise point a download at the app database or anything else the container can read.
  const resolveReadPath = async (relativePath: string) => {
    const [realRoot, realPath] = await Promise.all([fs.realpath(storageRoot), fs.realpath(absolutePathFor(relativePath))]);
    if (escapesRoot(realRoot, realPath)) {
      throw new Error("Storage path escapes configured root");
    }
    return realPath;
  };

  return {
    async writeUpload(input: WriteUploadInput): Promise<StoredFile> {
      const safeName = sanitizeFilename(input.filename);
      const relativeDirectory = targetDirectory(input.target);
      const absoluteDirectory = path.join(storageRoot, relativeDirectory);
      await fs.mkdir(absoluteDirectory, { recursive: true });

      const absolutePath = await nextAvailablePath(absoluteDirectory, safeName);
      await fs.writeFile(absolutePath, input.bytes, { flag: "wx" });
      await syncPath(absolutePath);
      await syncPath(absoluteDirectory);

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
    resolveReadPath,

    /**
     * Stream the request body straight to a temp file, hash it on the
     * way through, then atomically move it into the target directory.
     * Aborts and cleans up the temp file when the size cap is exceeded.
     */
    async streamUpload(input: StreamUploadInput): Promise<StoredFile> {
      const tempRelative = path.join(".uploads", `direct-${crypto.randomUUID()}.part`);
      const tempAbsolute = absolutePathFor(tempRelative);
      await fs.mkdir(path.dirname(tempAbsolute), { recursive: true });

      const source =
        input.body instanceof ReadableStream
          ? Readable.fromWeb(input.body as unknown as import("node:stream/web").ReadableStream<Uint8Array>)
          : (input.body as NodeJS.ReadableStream);
      const writer = createWriteStream(tempAbsolute, { flags: "wx" });

      const hash = crypto.createHash("sha256");
      let received = 0;
      const limiter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          received += chunk.length;
          if (received > input.maxBytes) {
            callback(new Error("upload exceeds size limit"));
            return;
          }
          hash.update(chunk);
          callback(null, chunk);
        }
      });

      try {
        await pipeline(source, limiter, writer);
        await syncPath(tempAbsolute);
      } catch (error) {
        await fs.unlink(tempAbsolute).catch(() => undefined);
        throw error;
      }

      try {
        const moved = await moveIntoDirectory({
          storageRoot,
          from: tempAbsolute,
          directory: path.join(storageRoot, targetDirectory(input.target), safeRelativeDirectory(input.relativePath)),
          filename: input.filename
        });
        await syncPath(path.dirname(moved.absolutePath));
        return {
          ...moved,
          sizeBytes: received,
          checksum: hash.digest("hex"),
          mimeType: input.mimeType || "application/octet-stream"
        };
      } catch (error) {
        await fs.unlink(tempAbsolute).catch(() => undefined);
        throw error;
      }
    },

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

      if (input.offset > stats.size) {
        throw uploadError("Upload chunk offset mismatch", "UPLOAD_OFFSET_MISMATCH");
      }

      // Positional, not append: a resent chunk rewrites the same bytes instead of growing the file.
      const handle = await fs.open(absolutePath, "r+");
      try {
        await handle.write(input.bytes, 0, input.bytes.length, input.offset);
      } finally {
        await handle.close();
      }
      return { receivedBytes: input.offset + input.bytes.length };
    },

    async completeUploadSession(input: CompleteUploadSessionInput): Promise<StoredFile> {
      const from = absolutePathFor(input.tempRelativePath);
      if ((await fs.stat(from)).size !== input.sizeBytes) {
        throw uploadError("Upload temp file size mismatch", "UPLOAD_SIZE_MISMATCH");
      }
      // Once per upload, not per chunk: the row the caller is about to commit must not outlive these bytes.
      await syncPath(from);
      const relativeDirectory = targetDirectory(input.target);
      const directory = path.join(storageRoot, relativeDirectory, safeRelativeDirectory(input.relativePath ?? undefined));
      const absolutePath = await moveIntoDirectory({
        storageRoot,
        from,
        directory,
        filename: input.filename
      });
      await syncPath(path.dirname(absolutePath.absolutePath));
      const stats = await fs.stat(absolutePath.absolutePath);

      return {
        ...absolutePath,
        sizeBytes: stats.size,
        checksum: await sha256File(absolutePath.absolutePath),
        mimeType: input.mimeType || "application/octet-stream"
      };
    },

    async fileDetails(relativePath: string) {
      const absolutePath = await resolveReadPath(relativePath);
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

    async moveToInbox(
      input: MoveToInboxInput
    ): Promise<{ absolutePath: string; relativePath: string }> {
      const from = absolutePathFor(input.currentRelativePath);
      const directory = path.join(storageRoot, "Inbox", sanitizePathSegment(input.sourceDevice));
      return moveIntoDirectory({
        storageRoot,
        from,
        directory,
        filename: input.filename
      });
    },

    async renameFile(
      input: RenameFileInput
    ): Promise<{ absolutePath: string; relativePath: string }> {
      const from = absolutePathFor(input.currentRelativePath);
      const filename = sanitizeFilename(input.filename);
      if (path.basename(from) === filename) {
        return {
          absolutePath: from,
          relativePath: path.relative(storageRoot, from).split(path.sep).join("/")
        };
      }

      return moveIntoDirectory({
        storageRoot,
        from,
        directory: path.dirname(from),
        filename
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

function safeRelativeDirectory(relativePath: string | undefined): string {
  if (!relativePath) {
    return "";
  }

  const rawDirectory = path.posix.dirname(relativePath.replace(/\\/g, "/"));
  if (rawDirectory === "." || rawDirectory === "/") {
    return "";
  }

  const safeSegments = rawDirectory
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== "." && segment !== "..")
    .map((segment) => sanitizePathSegment(segment));

  return safeSegments.join(path.sep);
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
  const staging: Staging = { path: null };
  try {
    for (let index = 1; index < 10_000; index += 1) {
      const candidateName = index === 1 ? filename : `${parsed.name}-${index}${parsed.ext}`;
      const candidatePath = path.join(directory, candidateName);
      try {
        await linkNoClobber(from, candidatePath, staging);
      } catch (error) {
        if (isNodeError(error) && error.code === "EEXIST") {
          continue;
        }
        throw error;
      }
      await finishMove(from, candidatePath, staging);
      return candidatePath;
    }
  } finally {
    await discardStaging(staging);
  }

  throw new Error(`Could not allocate filename for ${filename}`);
}

async function linkFile(from: string, to: string): Promise<void> {
  const staging: Staging = { path: null };
  try {
    await linkNoClobber(from, to, staging);
    await finishMove(from, to, staging);
  } finally {
    await discardStaging(staging);
  }
}

type Staging = { path: string | null };

// Hard links cannot cross filesystems (EXDEV), and a child ZFS dataset is one. Copy beside the
// destination first so the final link is same-filesystem and still refuses to clobber.
async function linkNoClobber(from: string, to: string, staging: Staging): Promise<void> {
  try {
    await fs.link(staging.path ?? from, to);
    return;
  } catch (error) {
    if (staging.path || !isNodeError(error) || error.code !== "EXDEV") {
      throw error;
    }
  }
  staging.path = await stageCopy(from, path.dirname(to));
  await fs.link(staging.path, to);
}

async function stageCopy(from: string, directory: string): Promise<string> {
  const staged = path.join(directory, `.${crypto.randomUUID()}.part`);
  try {
    await fs.copyFile(from, staged, fs.constants.COPYFILE_EXCL);
    const handle = await fs.open(staged, "r+");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    return staged;
  } catch (error) {
    await fs.unlink(staged).catch(() => undefined);
    throw error;
  }
}

async function finishMove(from: string, to: string, staging: Staging): Promise<void> {
  try {
    if (staging.path) {
      await fs.unlink(staging.path);
      staging.path = null;
    }
    await fs.unlink(from);
  } catch (error) {
    await fs.unlink(to).catch(() => undefined);
    throw error;
  }
}

async function discardStaging(staging: Staging): Promise<void> {
  if (staging.path) {
    await fs.unlink(staging.path).catch(() => undefined);
  }
}

// SQLite fsyncs its commits; file data does not get the same treatment unless asked. For a directory this
// makes the new name durable, which matters on ZFS where a transaction group can hold it for seconds.
async function syncPath(target: string): Promise<void> {
  const handle = await fs.open(target, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function escapesRoot(root: string, absolutePath: string): boolean {
  const relative = path.relative(root, absolutePath);
  // Not startsWith(".."): "..notes.txt" is a legal filename inside the root.
  return relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

function uploadError(message: string, code: "UPLOAD_OFFSET_MISMATCH" | "UPLOAD_SIZE_MISMATCH"): Error {
  return Object.assign(new Error(message), { code });
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
