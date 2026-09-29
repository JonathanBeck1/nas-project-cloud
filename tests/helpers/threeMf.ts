import fs from "node:fs";
import * as archiver from "archiver";
import sharp from "sharp";

export const THUMBNAIL_REL = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail";

// A package-level _rels/.rels like the ones PrusaSlicer, Bambu Studio and Cura write.
export function relsXml(thumbnailTarget?: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    ' <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>',
    thumbnailTarget ? ` <Relationship Target="${thumbnailTarget}" Id="rel-2" Type="${THUMBNAIL_REL}"/>` : "",
    "</Relationships>"
  ].join("\n");
}

export function png(width: number, height: number, color: string): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
}

export async function writeZip(filePath: string, entries: Array<{ name: string; data: Buffer | string }>): Promise<void> {
  const archive = archiver.create("zip", { zlib: { level: 6 } });
  const out = fs.createWriteStream(filePath);
  const closed = new Promise<void>((resolve, reject) => {
    out.on("close", resolve);
    archive.on("error", reject);
  });
  archive.pipe(out);
  for (const entry of entries) {
    archive.append(entry.data, { name: entry.name });
  }
  await archive.finalize();
  await closed;
}
