import { deflateSync } from 'node:zlib';

// App icons for the installable app (task 0014), drawn in code and encoded as PNG so the
// repository holds no binary files and no image dependency is needed. The Vite build emits
// them to dist/web/icons (see vite.config.ts); the dev server serves the same bytes.

export interface IconSpec {
  /** File name under `/icons/`. */
  file: string;
  /** Width and height in pixels. */
  size: number;
  /**
   * Maskable icons fill the whole square (the OS crops them to its own shape); the others are a
   * rounded square on a transparent background.
   */
  maskable: boolean;
}

/** The sizes browsers need to offer "Install" (192 and 512), a maskable one, and an iOS icon. */
export const ICONS: IconSpec[] = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
];

/** The pine colour of the UI (`--accent` in the light theme of src/web/styles.css). */
export const ICON_BACKGROUND = [0x1f, 0x3b, 0x2d] as const;
const WHITE = [0xff, 0xff, 0xff] as const;

/** Three rising bars, centred inside the safe zone of a maskable icon (the middle 80 %). */
const BARS = [
  { x: 0.26, width: 0.12, height: 0.2 },
  { x: 0.44, width: 0.12, height: 0.32 },
  { x: 0.62, width: 0.12, height: 0.46 },
];
const BARS_BOTTOM = 0.72;
const CORNER_RADIUS = 0.2;
const SUBSAMPLES = 4;

function insideShape(x: number, y: number, maskable: boolean): boolean {
  if (maskable) {
    return true;
  }
  const dx = Math.max(CORNER_RADIUS - x, x - (1 - CORNER_RADIUS), 0);
  const dy = Math.max(CORNER_RADIUS - y, y - (1 - CORNER_RADIUS), 0);
  return dx * dx + dy * dy <= CORNER_RADIUS * CORNER_RADIUS;
}

const insideBars = (x: number, y: number): boolean =>
  BARS.some(
    (bar) =>
      x >= bar.x && x <= bar.x + bar.width && y <= BARS_BOTTOM && y >= BARS_BOTTOM - bar.height,
  );

/** RGBA pixels, row by row. Edges are smoothed by averaging a few sub-samples per pixel. */
export function renderIconPixels(spec: IconSpec): Uint8Array {
  const { size, maskable } = spec;
  const pixels = new Uint8Array(size * size * 4);
  const samples = SUBSAMPLES * SUBSAMPLES;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let covered = 0;
      let white = 0;
      for (let sy = 0; sy < SUBSAMPLES; sy++) {
        for (let sx = 0; sx < SUBSAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SUBSAMPLES) / size;
          const y = (py + (sy + 0.5) / SUBSAMPLES) / size;
          if (insideShape(x, y, maskable)) {
            covered++;
            if (insideBars(x, y)) {
              white++;
            }
          }
        }
      }
      const offset = (py * size + px) * 4;
      if (covered > 0) {
        const mix = white / covered;
        for (let channel = 0; channel < 3; channel++) {
          pixels[offset + channel] = Math.round(
            (ICON_BACKGROUND[channel] ?? 0) * (1 - mix) + (WHITE[channel] ?? 0) * mix,
          );
        }
      }
      pixels[offset + 3] = Math.round((covered / samples) * 255);
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A PNG file (8-bit RGBA, no interlacing) with the icon drawn at the requested size. */
export function renderIconPng(spec: IconSpec): Buffer {
  const { size } = spec;
  const pixels = renderIconPixels(spec);
  // Each scanline starts with a filter byte; 0 means "none".
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
