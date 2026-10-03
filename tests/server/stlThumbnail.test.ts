import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderStlThumbnail } from "@/lib/server/previews/stlThumbnail";
import { asciiStl, binaryStl, cube, terrain, tetrahedron } from "../helpers/stl";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-stl-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function write(name: string, contents: Buffer | string) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents);
  return file;
}

async function image(rendered: Awaited<ReturnType<typeof renderStlThumbnail>>) {
  expect(Buffer.isBuffer(rendered)).toBe(true);
  const { data, info } = await sharp(rendered as Buffer).raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4);
  return { data, info, at };
}

describe("STL thumbnails", () => {
  it("draws a binary STL as a 768x576 image with the model in the middle and clear corners", async () => {
    const { info, at } = await image(await renderStlThumbnail(write("cube.stl", binaryStl(cube()))));

    expect(info).toMatchObject({ width: 768, height: 576, channels: 4 });
    expect(at(384, 288)[3]).toBe(255);
    expect(at(2, 2)[3]).toBe(0);
    expect(at(765, 573)[3]).toBe(0);
  });

  it("draws an ASCII STL the same way", async () => {
    const { info, at } = await image(await renderStlThumbnail(write("cube.stl", asciiStl(cube()))));

    expect(info).toMatchObject({ width: 768, height: 576 });
    expect(at(384, 288)[3]).toBe(255);
    expect(at(2, 2)[3]).toBe(0);
  });

  it("reads a binary STL whose header starts with 'solid' as binary", async () => {
    const { at } = await image(await renderStlThumbnail(write("cad.stl", binaryStl(cube(), "solid exported by a CAD tool"))));

    expect(at(384, 288)[3]).toBe(255);
  });

  it("shades faces that point different ways in different tones", async () => {
    const { data } = await image(await renderStlThumbnail(write("cube.stl", binaryStl(cube()))));
    const tones = new Set<string>();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 255) {
        tones.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      }
    }

    // A cube seen from front-right and above shows its top, front and right faces.
    expect(tones.size).toBe(3);
  });

  it("draws different shapes differently", async () => {
    const hash = async (file: string) =>
      crypto.createHash("sha256").update((await image(await renderStlThumbnail(file))).data).digest("hex");

    expect(await hash(write("cube.stl", binaryStl(cube())))).not.toBe(await hash(write("tetra.stl", binaryStl(tetrahedron()))));
  });

  it("skips an STL with no triangles", async () => {
    await expect(renderStlThumbnail(write("empty.stl", binaryStl([])))).resolves.toEqual({ skipped: "no triangles to draw" });
    await expect(renderStlThumbnail(write("empty-ascii.stl", "solid empty\nendsolid empty\n"))).resolves.toEqual({
      skipped: "no triangles to draw"
    });
  });

  it("skips a mesh past the triangle limit without drawing it", async () => {
    const file = write("big.stl", binaryStl(tetrahedron()));

    await expect(renderStlThumbnail(file, { maxTriangles: 2 })).resolves.toEqual({ skipped: "too large to draw" });
    await expect(renderStlThumbnail(write("big-ascii.stl", asciiStl(tetrahedron())), { maxTriangles: 2 })).resolves.toEqual({
      skipped: "too large to draw"
    });
  });

  it("rejects a truncated binary STL", async () => {
    const file = write("cut.stl", binaryStl(cube()).subarray(0, 300));

    await expect(renderStlThumbnail(file)).rejects.toThrow(/not a complete STL/);
  });

  it("rejects text that isn't an STL", async () => {
    await expect(renderStlThumbnail(write("notes.stl", "solid lies\nthis is not a mesh\n"))).rejects.toThrow(/no facets/);
  });

  it("streams the file instead of reading it whole", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/lib/server/previews/stlThumbnail.ts"), "utf8");

    expect(source).not.toContain("readFile(");
  });

  it("keeps the app responsive while drawing a large mesh", async () => {
    const file = write("terrain.stl", binaryStl(terrain(320)));
    const delay = monitorEventLoopDelay({ resolution: 10 });

    delay.enable();
    const rendered = await renderStlThumbnail(file);
    delay.disable();

    expect(Buffer.isBuffer(rendered)).toBe(true);
    // 204,800 triangles. No single stretch of drawing should hold the event loop for long.
    expect(delay.max / 1e6).toBeLessThan(250);
  });
});
