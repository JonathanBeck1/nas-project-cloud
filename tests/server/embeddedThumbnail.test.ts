import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readEmbeddedThumbnail } from "@/lib/server/previews/embeddedThumbnail";
import { png, relsXml, writeZip } from "../helpers/threeMf";

let dir: string;
const model = { name: "3D/3dmodel.model", data: "<model/>" };

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-3mf-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

async function threeMf(entries: Array<{ name: string; data: Buffer | string }>): Promise<string> {
  const filePath = path.join(dir, "part.3mf");
  await writeZip(filePath, [model, ...entries]);
  return filePath;
}

describe("thumbnails embedded in 3MF files", () => {
  it("follows the package thumbnail relationship before any fixed path", async () => {
    const thumbnail = await png(64, 48, "#d03030");
    const file = await threeMf([
      { name: "_rels/.rels", data: relsXml("/Metadata/thumbnail.png") },
      { name: "Metadata/thumbnail.png", data: thumbnail },
      { name: "Metadata/plate_1.png", data: await png(64, 48, "#3030d0") }
    ]);

    await expect(readEmbeddedThumbnail(file)).resolves.toEqual(thumbnail);
  });

  it("resolves a relative, percent-encoded target against differently cased entry names", async () => {
    const thumbnail = await png(32, 32, "#30d030");
    const file = await threeMf([
      { name: "_rels/.rels", data: relsXml("Auxiliaries/.thumbnails/Thumbnail%203mf.png") },
      { name: "Auxiliaries/.thumbnails/thumbnail 3mf.png", data: thumbnail }
    ]);

    await expect(readEmbeddedThumbnail(file)).resolves.toEqual(thumbnail);
  });

  it("falls back to the first plate image when the package declares no thumbnail", async () => {
    const plate = await png(64, 48, "#3030d0");
    const file = await threeMf([
      { name: "_rels/.rels", data: relsXml() },
      { name: "Metadata/plate_1.png", data: plate },
      { name: "Metadata/top_1.png", data: await png(64, 48, "#000000") }
    ]);

    await expect(readEmbeddedThumbnail(file)).resolves.toEqual(plate);
  });

  it("returns null when the file carries no image at all", async () => {
    const file = await threeMf([{ name: "_rels/.rels", data: relsXml() }]);

    await expect(readEmbeddedThumbnail(file)).resolves.toBeNull();
  });

  it("skips a declared thumbnail that is not really a PNG or JPEG", async () => {
    const plate = await png(16, 16, "#808080");
    const file = await threeMf([
      { name: "_rels/.rels", data: relsXml("/Metadata/thumbnail.png") },
      { name: "Metadata/thumbnail.png", data: "<svg onload=alert(1)/>" },
      { name: "Metadata/plate_1.png", data: plate }
    ]);

    await expect(readEmbeddedThumbnail(file)).resolves.toEqual(plate);
  });

  it("skips a thumbnail entry over the size cap instead of inflating it", async () => {
    const plate = await png(16, 16, "#808080");
    const bomb = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(17 * 1024 * 1024)]);
    const file = await threeMf([
      { name: "_rels/.rels", data: relsXml("/Metadata/thumbnail.png") },
      { name: "Metadata/thumbnail.png", data: bomb },
      { name: "Metadata/plate_1.png", data: plate }
    ]);

    await expect(readEmbeddedThumbnail(file)).resolves.toEqual(plate);
  });

  it("accepts a JPEG thumbnail", async () => {
    const jpeg = await (await import("sharp")).default({ create: { width: 20, height: 20, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    const file = await threeMf([
      { name: "_rels/.rels", data: relsXml("/Metadata/thumbnail.jpg") },
      { name: "Metadata/thumbnail.jpg", data: jpeg }
    ]);

    await expect(readEmbeddedThumbnail(file)).resolves.toEqual(jpeg);
  });

  it("rejects a file that is not a zip", async () => {
    const file = path.join(dir, "broken.3mf");
    fs.writeFileSync(file, "solid cube\nendsolid cube\n");

    await expect(readEmbeddedThumbnail(file)).rejects.toThrow();
  });
});
