import type { Readable } from "node:stream";
import yauzl, { type Entry, type ZipFile } from "yauzl";

const THUMBNAIL_RELATIONSHIP = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail";
// Where slicers put a preview when the package doesn't declare one: Bambu Studio and OrcaSlicer, then PrusaSlicer and Cura.
const FALLBACK_PATHS = ["metadata/plate_1.png", "metadata/thumbnail.png", "auxiliaries/.thumbnails/thumbnail_3mf.png"];
const MAX_THUMBNAIL_BYTES = 16 * 1024 * 1024;
const MAX_RELS_BYTES = 64 * 1024;
// Real slicer projects have a few hundred entries; a crafted file with millions must not keep the worker busy.
const MAX_ENTRIES = 10_000;

// A 3MF is a zip package. Slicers store a rendered PNG of the plate inside it, so no 3D rendering is needed.
export async function readEmbeddedThumbnail(absolutePath: string): Promise<Buffer | null> {
  // autoClose would close the file once the entry list ends, before the thumbnail is read; the finally closes it.
  const zip = await yauzl.openPromise(absolutePath, { lazyEntries: true, autoClose: false, validateEntrySizes: true, strictFileNames: false });
  try {
    const entries = await listEntries(zip);
    const declared = await declaredThumbnail(zip, entries);
    const candidates = [...(declared ? [declared] : []), ...FALLBACK_PATHS];

    for (const name of new Set(candidates)) {
      const entry = entries.get(name);
      if (!entry || entry.isEncrypted() || entry.uncompressedSize > MAX_THUMBNAIL_BYTES) {
        continue;
      }
      const data = await readEntry(zip, entry, MAX_THUMBNAIL_BYTES);
      if (isPngOrJpeg(data)) {
        return data;
      }
    }
    return null;
  } finally {
    zip.close();
  }
}

// OPC part names are case-insensitive, so entries are keyed by their lowercased name.
function listEntries(zip: ZipFile): Promise<Map<string, Entry>> {
  return new Promise((resolve, reject) => {
    const entries = new Map<string, Entry>();
    zip.on("entry", (entry: Entry) => {
      entries.set(entry.fileName.toLowerCase(), entry);
      if (entries.size >= MAX_ENTRIES) {
        resolve(entries);
        return;
      }
      zip.readEntry();
    });
    zip.once("end", () => resolve(entries));
    zip.once("error", reject);
    zip.readEntry();
  });
}

async function declaredThumbnail(zip: ZipFile, entries: Map<string, Entry>): Promise<string | null> {
  const rels = entries.get("_rels/.rels");
  if (!rels || rels.uncompressedSize > MAX_RELS_BYTES) {
    return null;
  }
  const xml = (await readEntry(zip, rels, MAX_RELS_BYTES)).toString("utf8");
  for (const tag of xml.match(/<Relationship\b[^>]*>/g) ?? []) {
    if (attribute(tag, "Type") !== THUMBNAIL_RELATIONSHIP) {
      continue;
    }
    const target = attribute(tag, "Target");
    if (target) {
      try {
        return decodeURIComponent(target).replace(/^\/+/, "").toLowerCase();
      } catch {
        return null;
      }
    }
  }
  return null;
}

function attribute(tag: string, name: string): string | null {
  return new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(tag)?.[1] ?? null;
}

async function readEntry(zip: ZipFile, entry: Entry, maxBytes: number): Promise<Buffer> {
  const stream: Readable = await zip.openReadStreamPromise(entry);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    total += (chunk as Buffer).length;
    if (total > maxBytes) {
      stream.destroy();
      throw new Error("embedded thumbnail is larger than it declared");
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export function isPngOrJpeg(data: Buffer): boolean {
  const isPng = data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  return isPng || isJpeg;
}
