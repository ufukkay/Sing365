// Small PNG pictures for signatures, drawn here so they work in every mail program (no SVG, no
// web fonts): round social-network icons in the brand colour, and a neutral sample logo used only
// in previews. Shapes are simple originals, rasterised with 4x4 supersampling and stored as PNG.
import { deflateSync } from "node:zlib";

export const ART_NETWORKS = ["linkedin", "x", "instagram", "facebook", "youtube"] as const;
export type ArtNetwork = (typeof ART_NETWORKS)[number];

type Inside = (x: number, y: number) => boolean;
type Layer = { inside: Inside; rgb: [number, number, number] };

const hypot = (x: number, y: number) => Math.sqrt(x * x + y * y);
const circle = (cx: number, cy: number, r: number): Inside => (x, y) => hypot(x - cx, y - cy) <= r;
const ring = (cx: number, cy: number, r1: number, r2: number): Inside => (x, y) => {
  const d = hypot(x - cx, y - cy);
  return d >= r1 && d <= r2;
};
const rect = (x1: number, y1: number, x2: number, y2: number): Inside => (x, y) => x >= x1 && x <= x2 && y >= y1 && y <= y2;
function roundRect(x1: number, y1: number, x2: number, y2: number, r: number): Inside {
  return (x, y) => {
    if (x < x1 || x > x2 || y < y1 || y > y2) return false;
    const cx = Math.min(Math.max(x, x1 + r), x2 - r);
    const cy = Math.min(Math.max(y, y1 + r), y2 - r);
    return hypot(x - cx, y - cy) <= r;
  };
}
/** A thick line with round ends. */
function stroke(ax: number, ay: number, bx: number, by: number, w: number): Inside {
  return (x, y) => {
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    return hypot(x - (ax + t * dx), y - (ay + t * dy)) <= w / 2;
  };
}
function triangle(p: [number, number][]): Inside {
  return (x, y) => {
    const s = (a: [number, number], b: [number, number]) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    const d1 = s(p[0]!, p[1]!);
    const d2 = s(p[1]!, p[2]!);
    const d3 = s(p[2]!, p[0]!);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
}
const any = (...parts: Inside[]): Inside => (x, y) => parts.some((p) => p(x, y));
const minus = (a: Inside, b: Inside): Inside => (x, y) => a(x, y) && !b(x, y);

/** White glyphs on a 64 x 64 grid. */
const GLYPHS: Record<ArtNetwork, Inside> = {
  linkedin: any(
    circle(21, 20, 4.2),
    rect(17, 27, 25, 46),
    rect(29, 27, 36.5, 46),
    rect(42, 36, 49.5, 46),
    (x, y) => y <= 36 && hypot(x - 39.25, y - 36) <= 10.25 && hypot(x - 39.25, y - 36) >= 2.75 && x >= 29,
  ),
  x: any(stroke(22, 20, 42, 44, 5.5), stroke(42, 20, 22, 44, 3.2)),
  instagram: any(
    minus(roundRect(17, 17, 47, 47, 9), roundRect(21, 21, 43, 43, 5.5)),
    ring(32, 32, 4.6, 8.4),
    circle(40.8, 23.2, 2.3),
  ),
  facebook: any(
    rect(29, 25, 36, 52),
    rect(24, 31, 42, 37),
    (x, y) => y <= 25 && x <= 41 && hypot(x - 41, y - 25) >= 5 && hypot(x - 41, y - 25) <= 12,
    rect(41, 13, 44, 20),
  ),
  youtube: minus(roundRect(13, 20, 51, 44, 8), triangle([[28, 25.5], [28, 38.5], [39.5, 32]])),
};

function hexRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Rasterises layers (last wins) into RGBA with 4x4 supersampling. */
function rasterise(width: number, height: number, layers: Layer[], scale: number): Buffer {
  const out = Buffer.alloc(width * height * 4);
  const sub = 4;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < sub; sy++) {
        for (let sx = 0; sx < sub; sx++) {
          const x = (px + (sx + 0.5) / sub) / scale;
          const y = (py + (sy + 0.5) / sub) / scale;
          for (let i = layers.length - 1; i >= 0; i--) {
            const layer = layers[i]!;
            if (layer.inside(x, y)) {
              r += layer.rgb[0];
              g += layer.rgb[1];
              b += layer.rgb[2];
              a += 1;
              break;
            }
          }
        }
      }
      const o = (py * width + px) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
        out[o + 3] = Math.round((a / (sub * sub)) * 255);
      }
    }
  }
  return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
export function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A round icon, 60 x 60 px (shown at 20 px, sharp on high-density screens). */
export function socialIconPng(network: ArtNetwork, color: string): Buffer {
  const size = 60;
  const layers: Layer[] = [
    { inside: circle(32, 32, 31.5), rgb: hexRgb(color) },
    { inside: GLYPHS[network], rgb: [255, 255, 255] },
  ];
  return encodePng(size, size, rasterise(size, size, layers, size / 64));
}

/** A neutral sample logo (mark plus two bars), 480 x 144 px, shown at 160 x 48 in previews. */
export function sampleLogoPng(color: string): Buffer {
  const [w, h, scale] = [480, 144, 3];
  const layers: Layer[] = [
    { inside: roundRect(2, 4, 42, 44, 10), rgb: hexRgb(color) },
    { inside: any(stroke(13, 33, 22, 15, 5), stroke(22, 15, 31, 33, 5), stroke(16, 27, 28, 27, 4)), rgb: [255, 255, 255] },
    { inside: roundRect(52, 10, 150, 24, 7), rgb: [51, 65, 85] },
    { inside: roundRect(52, 31, 118, 39, 4), rgb: [148, 163, 184] },
  ];
  return encodePng(w, h, rasterise(w, h, layers, scale));
}

const ART_FILE = /^(linkedin|x|instagram|facebook|youtube|sample-logo)-([0-9a-f]{6})\.png$/;

/** Reads a file name such as "linkedin-166b63.png". */
export function parseArtFile(name: string): { kind: ArtNetwork | "sample-logo"; color: string } | null {
  const m = ART_FILE.exec(name);
  return m ? { kind: m[1] as ArtNetwork | "sample-logo", color: `#${m[2]}` } : null;
}

const cache = new Map<string, Buffer>();
export function artPng(name: string): Buffer | null {
  const art = parseArtFile(name);
  if (!art) return null;
  let png = cache.get(name);
  if (!png) {
    png = art.kind === "sample-logo" ? sampleLogoPng(art.color) : socialIconPng(art.kind, art.color);
    if (cache.size > 500) cache.clear();
    cache.set(name, png);
  }
  return png;
}
