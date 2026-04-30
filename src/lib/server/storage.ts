import crypto from "node:crypto";
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

export type StoredFile = {
  absolutePath: string;
  relativePath: string;
  sizeBytes: number;
  checksum: string;
  mimeType: string;
};

export function createStorageService(root = appConfig.storageRoot) {
  const storageRoot = path.resolve(root);

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

    absolutePathFor(relativePath: string) {
      const absolutePath = path.resolve(storageRoot, relativePath);
      const resolvedRelativePath = path.relative(storageRoot, absolutePath);
      if (resolvedRelativePath.startsWith("..") || path.isAbsolute(resolvedRelativePath)) {
        throw new Error("Storage path escapes configured root");
      }
      return absolutePath;
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

function sha256(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
