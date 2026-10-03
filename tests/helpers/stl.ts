export type Triangle = [number, number, number, number, number, number, number, number, number];

type Point = [number, number, number];

const quad = (a: Point, b: Point, c: Point, d: Point): Triangle[] => [
  [...a, ...b, ...c] as Triangle,
  [...a, ...c, ...d] as Triangle
];

export function cube(size = 10): Triangle[] {
  const s = size;
  return [
    ...quad([0, 0, 0], [0, s, 0], [s, s, 0], [s, 0, 0]),
    ...quad([0, 0, s], [s, 0, s], [s, s, s], [0, s, s]),
    ...quad([0, 0, 0], [s, 0, 0], [s, 0, s], [0, 0, s]),
    ...quad([0, s, 0], [0, s, s], [s, s, s], [s, s, 0]),
    ...quad([0, 0, 0], [0, 0, s], [0, s, s], [0, s, 0]),
    ...quad([s, 0, 0], [s, s, 0], [s, s, s], [s, 0, s])
  ];
}

export function tetrahedron(size = 10): Triangle[] {
  const a: Point = [0, 0, 0];
  const b: Point = [size, 0, 0];
  const c: Point = [size / 2, size, 0];
  const d: Point = [size / 2, size / 3, size];
  return [
    [...a, ...c, ...b] as Triangle,
    [...a, ...b, ...d] as Triangle,
    [...b, ...c, ...d] as Triangle,
    [...c, ...a, ...d] as Triangle
  ];
}

// A wavy height field: lots of small triangles, like a scanned or sculpted model.
export function terrain(cells: number, size = 100): Triangle[] {
  const height = (x: number, y: number) => 5 * Math.sin(x / 7) * Math.cos(y / 9);
  const step = size / cells;
  const triangles: Triangle[] = [];
  for (let i = 0; i < cells; i += 1) {
    for (let j = 0; j < cells; j += 1) {
      const [x0, y0, x1, y1] = [i * step, j * step, (i + 1) * step, (j + 1) * step];
      triangles.push(
        ...quad([x0, y0, height(x0, y0)], [x1, y0, height(x1, y0)], [x1, y1, height(x1, y1)], [x0, y1, height(x0, y1)])
      );
    }
  }
  return triangles;
}

export function binaryStl(triangles: Triangle[], header = "binary stl from tests"): Buffer {
  const buffer = Buffer.alloc(84 + triangles.length * 50);
  buffer.write(header.slice(0, 80), 0, "latin1");
  buffer.writeUInt32LE(triangles.length, 80);
  triangles.forEach((triangle, index) => {
    const offset = 84 + index * 50;
    triangle.forEach((value, k) => buffer.writeFloatLE(value, offset + 12 + k * 4));
  });
  return buffer;
}

export function asciiStl(triangles: Triangle[], name = "part"): string {
  const facets = triangles.map((t) =>
    [
      "  facet normal 0 0 0",
      "    outer loop",
      `      vertex ${t[0]} ${t[1]} ${t[2]}`,
      `      vertex ${t[3]} ${t[4]} ${t[5]}`,
      `      vertex ${t[6]} ${t[7]} ${t[8]}`,
      "    endloop",
      "  endfacet"
    ].join("\n")
  );
  return [`solid ${name}`, ...facets, `endsolid ${name}`, ""].join("\n");
}
