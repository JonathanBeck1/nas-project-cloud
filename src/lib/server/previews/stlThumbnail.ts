import { open, type FileHandle } from "node:fs/promises";
import sharp from "sharp";

type Vec3 = [number, number, number];
type Visit = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) => void;

export type StlThumbnailResult = Buffer | { skipped: string };

// Twice the preview size, so the preview step's downscale smooths the edges. 4:3 like the gallery tiles, which crop
// anything else.
const WIDTH = 768;
const HEIGHT = 576;
const MARGIN = 0.06;
const DEFAULT_MAX_TRIANGLES = 25_000_000;
const HEADER_BYTES = 84;
const TRIANGLE_BYTES = 50;
// About 1 MiB of whole triangles per read. The await between reads lets the app serve requests mid-render.
const BINARY_CHUNK_BYTES = Math.floor((1024 * 1024) / TRIANGLE_BYTES) * TRIANGLE_BYTES;
const TEXT_CHUNK_BYTES = 1024 * 1024;
const MODEL_RGB: Vec3 = [150, 168, 188];
const AMBIENT = 0.35;
const DIFFUSE = 0.65;

// An orthographic 3/4 view from front-right and above, with Z up as slicers and CAD exports use.
const FORWARD = normalize([-1, 1, -0.8]);
const RIGHT = normalize(cross(FORWARD, [0, 0, 1]));
const UP = cross(RIGHT, FORWARD);
// Light from over the viewer's left shoulder, so top, front and side faces read as three tones.
const LIGHT = normalize(add(add(scale(FORWARD, -1), scale(UP, 0.6)), scale(RIGHT, -0.4)));

const NO_TRIANGLES = { skipped: "no triangles to draw" };
const TOO_LARGE = { skipped: "too large to draw" };
const TOO_LARGE_SIGNAL = Symbol("too large");

/**
 * Draw a shaded preview of an STL mesh as a PNG. The file is read twice, once
 * for the bounds and once to draw, so memory stays flat however big the mesh is.
 */
export async function renderStlThumbnail(
  absolutePath: string,
  options: { maxTriangles?: number } = {}
): Promise<StlThumbnailResult> {
  const maxTriangles = options.maxTriangles ?? DEFAULT_MAX_TRIANGLES;
  const handle = await open(absolutePath, "r");
  try {
    const { size } = await handle.stat();
    const header = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(header, 0, HEADER_BYTES, 0);
    const declared = bytesRead === HEADER_BYTES ? header.readUInt32LE(80) : -1;

    let forEachTriangle: (visit: Visit) => Promise<void>;
    // The size check comes first: plenty of binary files start their header with "solid" too.
    if (declared >= 0 && size === HEADER_BYTES + declared * TRIANGLE_BYTES) {
      if (declared > maxTriangles) {
        return TOO_LARGE;
      }
      forEachTriangle = (visit) => forEachBinaryTriangle(handle, declared, visit);
    } else if (header.toString("latin1", 0, bytesRead).trimStart().startsWith("solid")) {
      forEachTriangle = (visit) => forEachAsciiTriangle(handle, visit);
    } else {
      throw new Error("not a complete STL: its size doesn't match the triangle count in its header");
    }

    let count = 0;
    let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity];
    const extend = (x: number, y: number, z: number) => {
      const sx = x * RIGHT[0] + y * RIGHT[1] + z * RIGHT[2];
      const sy = x * UP[0] + y * UP[1] + z * UP[2];
      minX = Math.min(minX, sx);
      maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy);
      maxY = Math.max(maxY, sy);
    };
    try {
      await forEachTriangle((ax, ay, az, bx, by, bz, cx, cy, cz) => {
        count += 1;
        if (count > maxTriangles) {
          throw TOO_LARGE_SIGNAL;
        }
        extend(ax, ay, az);
        extend(bx, by, bz);
        extend(cx, cy, cz);
      });
    } catch (error) {
      if (error === TOO_LARGE_SIGNAL) {
        return TOO_LARGE;
      }
      throw error;
    }

    const spanX = maxX - minX;
    const spanY = maxY - minY;
    if (count === 0 || !(Math.max(spanX, spanY) > 0)) {
      return NO_TRIANGLES;
    }

    const fit = Math.min((WIDTH * (1 - 2 * MARGIN)) / spanX, (HEIGHT * (1 - 2 * MARGIN)) / spanY);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const depth = new Float32Array(WIDTH * HEIGHT).fill(Infinity);
    const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
    await forEachTriangle((ax, ay, az, bx, by, bz, cx, cy, cz) =>
      drawTriangle(depth, pixels, fit, centerX, centerY, ax, ay, az, bx, by, bz, cx, cy, cz)
    );

    return await sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).png().toBuffer();
  } finally {
    await handle.close();
  }
}

function drawTriangle(
  depth: Float32Array,
  pixels: Uint8Array,
  fit: number,
  centerX: number,
  centerY: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number
) {
  // The normal comes from the vertices, since exporters often leave the stored one zeroed. Two-sided, so flipped
  // faces still read.
  const [ux, uy, uz] = [bx - ax, by - ay, bz - az];
  const [vx, vy, vz] = [cx - ax, cy - ay, cz - az];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz);
  if (!(length > 0)) {
    return;
  }
  const light = AMBIENT + DIFFUSE * Math.abs((nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / length);
  const r = Math.round(MODEL_RGB[0] * light);
  const g = Math.round(MODEL_RGB[1] * light);
  const b = Math.round(MODEL_RGB[2] * light);

  const project = (x: number, y: number, z: number): Vec3 => [
    (x * RIGHT[0] + y * RIGHT[1] + z * RIGHT[2] - centerX) * fit + WIDTH / 2,
    HEIGHT / 2 - (x * UP[0] + y * UP[1] + z * UP[2] - centerY) * fit,
    x * FORWARD[0] + y * FORWARD[1] + z * FORWARD[2]
  ];
  const [x0, y0, z0] = project(ax, ay, az);
  const [x1, y1, z1] = project(bx, by, bz);
  const [x2, y2, z2] = project(cx, cy, cz);
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (area === 0) {
    return;
  }

  const left = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const right = Math.min(WIDTH - 1, Math.ceil(Math.max(x0, x1, x2)));
  const top = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const bottom = Math.min(HEIGHT - 1, Math.ceil(Math.max(y0, y1, y2)));
  for (let y = top; y <= bottom; y += 1) {
    const py = y + 0.5;
    for (let x = left; x <= right; x += 1) {
      const px = x + 0.5;
      const w0 = (x1 - px) * (y2 - py) - (x2 - px) * (y1 - py);
      const w1 = (x2 - px) * (y0 - py) - (x0 - px) * (y2 - py);
      const w2 = (x0 - px) * (y1 - py) - (x1 - px) * (y0 - py);
      const inside = area > 0 ? w0 >= 0 && w1 >= 0 && w2 >= 0 : w0 <= 0 && w1 <= 0 && w2 <= 0;
      if (!inside) {
        continue;
      }
      const index = y * WIDTH + x;
      const z = (w0 * z0 + w1 * z1 + w2 * z2) / area;
      if (z < depth[index]) {
        depth[index] = z;
        pixels[index * 4] = r;
        pixels[index * 4 + 1] = g;
        pixels[index * 4 + 2] = b;
        pixels[index * 4 + 3] = 255;
      }
    }
  }
}

async function forEachBinaryTriangle(handle: FileHandle, count: number, visit: Visit) {
  const buffer = Buffer.allocUnsafe(BINARY_CHUNK_BYTES);
  let position = HEADER_BYTES;
  let remaining = count;
  while (remaining > 0) {
    const want = Math.min(remaining * TRIANGLE_BYTES, BINARY_CHUNK_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, want, position);
    if (bytesRead < want) {
      throw new Error("not a complete STL: it ends before its last triangle");
    }
    for (let offset = 0; offset < want; offset += TRIANGLE_BYTES) {
      // Each record is a 12-byte normal, three 12-byte vertices and a 2-byte attribute.
      visitFinite(
        visit,
        buffer.readFloatLE(offset + 12),
        buffer.readFloatLE(offset + 16),
        buffer.readFloatLE(offset + 20),
        buffer.readFloatLE(offset + 24),
        buffer.readFloatLE(offset + 28),
        buffer.readFloatLE(offset + 32),
        buffer.readFloatLE(offset + 36),
        buffer.readFloatLE(offset + 40),
        buffer.readFloatLE(offset + 44)
      );
    }
    position += want;
    remaining -= want / TRIANGLE_BYTES;
  }
}

async function forEachAsciiTriangle(handle: FileHandle, visit: Visit) {
  const buffer = Buffer.allocUnsafe(TEXT_CHUNK_BYTES);
  const vertices: number[] = [];
  let position = 0;
  let carry = "";
  let facets = 0;
  let ended = false;

  const readLine = (line: string) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("vertex")) {
      const [, x, y, z] = trimmed.split(/\s+/);
      vertices.push(Number(x), Number(y), Number(z));
      if (vertices.length === 9) {
        facets += 1;
        visitFinite(visit, ...(vertices as [number, number, number, number, number, number, number, number, number]));
        vertices.length = 0;
      }
    } else if (trimmed.startsWith("facet")) {
      vertices.length = 0;
    } else if (trimmed.startsWith("endsolid")) {
      ended = true;
    }
  };

  for (;;) {
    const { bytesRead } = await handle.read(buffer, 0, TEXT_CHUNK_BYTES, position);
    if (bytesRead === 0) {
      break;
    }
    position += bytesRead;
    const lines = (carry + buffer.toString("latin1", 0, bytesRead)).split("\n");
    carry = lines.pop() ?? "";
    lines.forEach(readLine);
  }
  readLine(carry);

  if (facets === 0 && !ended) {
    throw new Error("not an STL: no facets found");
  }
}

// A few exporters write NaN or infinite vertices; leave those triangles out rather than poison the bounds.
function visitFinite(
  visit: Visit,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number
) {
  if (Number.isFinite(ax + ay + az + bx + by + bz + cx + cy + cz)) {
    visit(ax, ay, az, bx, by, bz, cx, cy, cz);
  }
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / length, v[1] / length, v[2] / length];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(v: Vec3, factor: number): Vec3 {
  return [v[0] * factor, v[1] * factor, v[2] * factor];
}
