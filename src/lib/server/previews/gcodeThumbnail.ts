import fs from "node:fs/promises";
import { isPngOrJpeg } from "./embeddedThumbnail";

// Slicers write thumbnails at the top of the file; G-code itself can run to hundreds of megabytes.
const HEAD_BYTES = 8 * 1024 * 1024;
// "; thumbnail begin 300x300 12345", "; thumbnail_JPG begin ...", Cura's ";thumbnail begin ...", and Creality
// Print's "; png begin 300*300 43108 13 274 200".
const BEGIN = /^;\s*(?:thumbnail(?:_(png|jpg|qoi))?|(png|jpg))\s+begin\s+(\d+)[x*](\d+)\b/i;
const END = /^;\s*(?:thumbnail(?:_\w+)?|png|jpg)\s+end\b/i;
const DATA = /^;\s*([A-Za-z0-9+/=]+)\s*$/;
// Snapmaker Luban writes the whole image on one line.
const DATA_URI = /^;\s*thumbnail:\s*data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)\s*$/i;

type Block = { format: string; pixels: number; rows: string[] };

// PrusaSlicer, OrcaSlicer, Bambu Studio and Cura's thumbnail script store the plate preview as base64 comment lines.
export async function readGcodeThumbnail(absolutePath: string): Promise<Buffer | null> {
  const handle = await fs.open(absolutePath, "r");
  let head: string;
  try {
    const { size } = await handle.stat();
    const buffer = Buffer.alloc(Math.min(size, HEAD_BYTES));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    head = buffer.toString("latin1", 0, bytesRead);
  } finally {
    await handle.close();
  }

  const blocks: Block[] = [];
  let current: Block | null = null;
  for (const line of head.split(/\r?\n/)) {
    const begin = BEGIN.exec(line);
    if (begin) {
      current = { format: (begin[1] ?? begin[2] ?? "png").toLowerCase(), pixels: Number(begin[3]) * Number(begin[4]), rows: [] };
      continue;
    }
    const dataUri = DATA_URI.exec(line);
    if (dataUri) {
      // No size is declared; rank it below any block that declares one.
      blocks.push({ format: dataUri[1].toLowerCase(), pixels: 0, rows: [dataUri[2]] });
      continue;
    }
    if (!current) {
      continue;
    }
    if (END.test(line)) {
      blocks.push(current);
      current = null;
      continue;
    }
    const data = DATA.exec(line);
    if (data) {
      current.rows.push(data[1]);
    } else {
      current = null;
    }
  }

  // QOI has no decoder in the bundled image library.
  const decodable = blocks.filter((block) => block.format !== "qoi").sort((a, b) => b.pixels - a.pixels);
  for (const block of decodable) {
    const image = Buffer.from(block.rows.join(""), "base64");
    if (isPngOrJpeg(image)) {
      return image;
    }
  }
  return null;
}
