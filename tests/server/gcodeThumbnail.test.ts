import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readGcodeThumbnail } from "@/lib/server/previews/gcodeThumbnail";
import { gcode, thumbnailBlock } from "../helpers/gcode";
import { png } from "../helpers/threeMf";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-gcode-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function write(contents: string | Buffer, name = "part.gcode"): string {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, contents);
  return filePath;
}

describe("thumbnails embedded in G-code", () => {
  it("decodes a PrusaSlicer thumbnail block", async () => {
    const image = await png(160, 120, "#d03030");

    await expect(readGcodeThumbnail(write(gcode(thumbnailBlock(image, 160, 120))))).resolves.toEqual(image);
  });

  it("picks the largest of several thumbnails", async () => {
    const small = await png(16, 16, "#000000");
    const large = await png(220, 124, "#3030d0");
    const file = write(gcode(thumbnailBlock(small, 16, 16), thumbnailBlock(large, 220, 124)));

    await expect(readGcodeThumbnail(file)).resolves.toEqual(large);
  });

  it("reads JPEG blocks and skips QOI, which the image library cannot decode", async () => {
    const jpeg = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    const qoi = Buffer.from("qoif fake qoi payload");
    const file = write(gcode(thumbnailBlock(qoi, 300, 300, "thumbnail_QOI"), thumbnailBlock(jpeg, 100, 100, "thumbnail_JPG")));

    await expect(readGcodeThumbnail(file)).resolves.toEqual(jpeg);
  });

  it("handles OrcaSlicer block wrappers, Windows line endings and Cura's ;thumbnail spelling", async () => {
    const image = await png(64, 64, "#30d030");
    const orca = ["; THUMBNAIL_BLOCK_START", thumbnailBlock(image, 64, 64).replace(/^; thumbnail/gm, ";thumbnail"), "; THUMBNAIL_BLOCK_END"].join("\n");

    await expect(readGcodeThumbnail(write(gcode(orca).replace(/\n/g, "\r\n")))).resolves.toEqual(image);
  });

  it("reads Creality Print's png blocks, which size themselves as WxH with an asterisk", async () => {
    const small = await png(96, 96, "#000000");
    const large = await png(300, 300, "#d0a030");
    const creality = (image: Buffer, size: number) =>
      thumbnailBlock(image, size, size, "png").replace(`png begin ${size}x${size}`, `png begin ${size}*${size}`).replace(/(begin \S+ \d+)/, "$1 4 87 200");

    await expect(readGcodeThumbnail(write(gcode(creality(small, 96), creality(large, 300))))).resolves.toEqual(large);
  });

  it("reads Snapmaker's single-line data URI thumbnail", async () => {
    const image = await png(300, 150, "#30a0d0");
    const snapmaker = `;header_type: 3dp\n;thumbnail: data:image/png;base64,${image.toString("base64")}\n;file_total_lines: 10371`;

    await expect(readGcodeThumbnail(write(gcode(snapmaker)))).resolves.toEqual(image);
  });

  it("returns null when the file has no thumbnail, only QOI, or a block that never ends", async () => {
    const image = await png(32, 32, "#808080");
    const unterminated = thumbnailBlock(image, 32, 32).replace("; thumbnail end", "G1 X0");

    await expect(readGcodeThumbnail(write(gcode(), "none.gcode"))).resolves.toBeNull();
    await expect(readGcodeThumbnail(write(gcode(thumbnailBlock(Buffer.from("qoif"), 8, 8, "thumbnail_QOI")), "qoi.gcode"))).resolves.toBeNull();
    await expect(readGcodeThumbnail(write(gcode(unterminated), "cut.gcode"))).resolves.toBeNull();
  });

  it("ignores a block whose data is not really a PNG or JPEG", async () => {
    const real = await png(20, 20, "#808080");
    const file = write(gcode(thumbnailBlock(Buffer.from("<svg onload=alert(1)/>"), 400, 400), thumbnailBlock(real, 20, 20)));

    await expect(readGcodeThumbnail(file)).resolves.toEqual(real);
  });

  it("only looks at the start of the file, where slicers put thumbnails", async () => {
    const image = await png(32, 32, "#d03030");
    const body = "G1 X10 Y10 E0.1\n".repeat(600_000);
    const file = write(`${gcode()}${body}${thumbnailBlock(image, 32, 32)}\n`);

    await expect(readGcodeThumbnail(file)).resolves.toBeNull();
  });
});
