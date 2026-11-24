import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ICON_BACKGROUND, ICONS, PNG_SIGNATURE, renderIconPng, type IconSpec } from './pwaIcons.js';

const WEB = resolve(import.meta.dirname, '../web');

// A small PNG reader: enough to check the encoder without an image library.
function decode(png: Buffer) {
  expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  const chunks: { type: string; data: Buffer }[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    const data = png.subarray(offset + 8, offset + 8 + length);
    const crc = png.readUInt32BE(offset + 8 + length);
    chunks.push({ type, data });
    expect(crc, `CRC of ${type}`).toBe(crc32(png.subarray(offset + 4, offset + 8 + length)));
    offset += 12 + length;
  }
  const header = chunks.find((c) => c.type === 'IHDR')?.data ?? Buffer.alloc(13);
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const raw = inflateSync(
    Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)),
  );
  const stride = width * 4 + 1;
  const pixel = (xFraction: number, yFraction: number) => {
    const x = Math.floor(xFraction * width);
    const y = Math.floor(yFraction * height);
    const at = y * stride + 1 + x * 4;
    return [raw[at], raw[at + 1], raw[at + 2], raw[at + 3]];
  };
  return { chunks, width, height, bitDepth: header[8], colourType: header[9], raw, stride, pixel };
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const spec = (file: string): IconSpec => {
  const found = ICONS.find((i) => i.file === file);
  if (found === undefined) {
    throw new Error(file);
  }
  return found;
};

describe('renderIconPng', () => {
  it.each(ICONS)('$file is a valid RGBA PNG of $size × $size with correct checksums', (icon) => {
    const decoded = decode(renderIconPng(icon));
    expect(decoded.chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect([decoded.width, decoded.height]).toEqual([icon.size, icon.size]);
    expect([decoded.bitDepth, decoded.colourType]).toEqual([8, 6]);
    expect(decoded.raw.length).toBe(icon.size * (icon.size * 4 + 1));
    // Every scanline uses filter 0.
    for (let y = 0; y < icon.size; y++) {
      expect(decoded.raw[y * decoded.stride]).toBe(0);
    }
  });

  it('draws the rounded icon: transparent corners, accent background, white bars', () => {
    const { pixel } = decode(renderIconPng(spec('icon-512.png')));
    expect(pixel(0.002, 0.002)[3]).toBe(0); // the corner is cut off
    expect(pixel(0.5, 0.02)).toEqual([...ICON_BACKGROUND, 255]); // top edge, inside the shape
    expect(pixel(0.68, 0.6)).toEqual([255, 255, 255, 255]); // the tallest bar
    expect(pixel(0.5, 0.15)).toEqual([...ICON_BACKGROUND, 255]); // above the middle bar
  });

  it('a maskable icon fills the whole square, bars inside the safe zone', () => {
    const { pixel } = decode(renderIconPng(spec('icon-maskable-512.png')));
    expect(pixel(0.002, 0.002)).toEqual([...ICON_BACKGROUND, 255]);
    expect(pixel(0.998, 0.998)).toEqual([...ICON_BACKGROUND, 255]);
    expect(pixel(0.68, 0.6)).toEqual([255, 255, 255, 255]);
  });

  it('smooths the rounded corner instead of leaving a jagged edge', () => {
    const { raw, stride, width } = decode(renderIconPng(spec('icon-512.png')));
    const alphas = new Set<number>();
    for (let y = 0; y < 60; y++) {
      for (let x = 0; x < 60; x++) {
        alphas.add(raw[y * stride + 1 + x * 4 + 3] ?? 0);
      }
    }
    expect(width).toBe(512);
    expect(alphas.size).toBeGreaterThan(3); // partial coverage exists along the curve
  });

  it('is deterministic', () => {
    const icon = spec('icon-192.png');
    expect(renderIconPng(icon).equals(renderIconPng(icon))).toBe(true);
  });

  it('the icons stay small', () => {
    for (const icon of ICONS) {
      expect(renderIconPng(icon).length, icon.file).toBeLessThan(20_000);
    }
  });
});

describe('web app manifest', () => {
  const manifest = JSON.parse(readFileSync(join(WEB, 'public/manifest.webmanifest'), 'utf8')) as {
    id: string;
    name: string;
    short_name: string;
    lang: string;
    start_url: string;
    scope: string;
    display: string;
    background_color: string;
    theme_color: string;
    icons: { src: string; sizes: string; type: string; purpose: string }[];
  };
  const css = readFileSync(join(WEB, 'styles.css'), 'utf8');
  // The installed app uses the light theme's colours (snow background, pine accent).
  const light = css.slice(css.indexOf(":root[data-theme='light']"));
  const variable = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(light)?.[1];

  it('makes the app installable as a standalone application', () => {
    expect(manifest.name).toBe('Personal OS');
    expect(manifest.short_name).toBe('Personal OS');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.lang).toBe('es-ES');
  });

  it('uses the colours of the UI: the light background and the accent', () => {
    expect(manifest.background_color).toBe(variable('bg'));
    expect(manifest.theme_color).toBe(variable('accent'));
    // The icon background is the same accent colour.
    const hex = ICON_BACKGROUND.map((c) => c.toString(16).padStart(2, '0')).join('');
    expect(`#${hex}`).toBe(variable('accent'));
  });

  it('lists the 192 and 512 icons browsers require, plus a maskable one, all generated', () => {
    const sizes = manifest.icons.map((icon) => `${icon.sizes}/${icon.purpose}`);
    expect(sizes).toEqual(
      expect.arrayContaining(['192x192/any', '512x512/any', '512x512/maskable']),
    );
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png');
      const generated = ICONS.find((i) => `/icons/${i.file}` === icon.src);
      expect(generated, icon.src).toBeDefined();
      expect(`${String(generated?.size)}x${String(generated?.size)}`).toBe(icon.sizes);
      expect(generated?.maskable).toBe(icon.purpose === 'maskable');
    }
  });

  it('is linked from the page together with the theme colour and icons', () => {
    const html = readFileSync(join(WEB, 'index.html'), 'utf8');
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain(`<meta name="theme-color" content="${manifest.theme_color}" />`);
    expect(html).toContain('href="/icons/apple-touch-icon.png"');
    for (const file of ['icon-192.png', 'apple-touch-icon.png']) {
      expect(ICONS.some((i) => i.file === file)).toBe(true);
    }
  });

  it('asks for no offline caching: there is no service worker', () => {
    const html = readFileSync(join(WEB, 'index.html'), 'utf8');
    expect(html).not.toMatch(/serviceWorker/);
    expect(manifest).not.toHaveProperty('serviceworker');
  });
});
