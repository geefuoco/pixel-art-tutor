/// <reference types="node" />
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { STUDIO_PLACEHOLDER_PALETTE } from './palettes';
import { drawingFromImage, exportPng } from './png';
import { drawingOf, rowsOf } from './test-grids';

/** Test helper: a minimal, independent PNG decoder for 8-bit RGBA, non-interlaced PNGs. */
function decodePng(bytes: Uint8Array): { width: number; height: number; rgba: number[][] } {
  const buf = Buffer.from(bytes);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((b, i) => buf[i] === b)) throw new Error('Not a PNG signature');
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  let ended = false;
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    const crc = buf.readUInt32BE(offset + 8 + length);
    if (crc !== crc32(buf.subarray(offset + 4, offset + 8 + length))) {
      throw new Error(`Bad CRC on ${type}`);
    }
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const [depth, colorType, , , interlace] = data.subarray(8);
      if (depth !== 8 || colorType !== 6 || interlace !== 0) {
        throw new Error('Helper only decodes 8-bit RGBA, non-interlaced');
      }
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') ended = true;
    offset += 12 + length;
  }
  if (!ended) throw new Error('No IEND chunk');
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  if (raw.length !== height * (stride + 1)) throw new Error('Wrong image data length');
  const rgba: number[][] = [];
  let prev = new Array<number>(stride).fill(0);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = [...raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))];
    const row: number[] = [];
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? row[i - 4]! : 0;
      const b = prev[i]!;
      const c = i >= 4 ? prev[i - 4]! : 0;
      const predictor = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
      if (predictor === undefined) throw new Error(`Unknown filter ${filter}`);
      row.push((line[i]! + predictor) & 0xff);
    }
    for (let x = 0; x < width; x++) rgba.push(row.slice(x * 4, x * 4 + 4));
    prev = row;
  }
  return { width, height, rgba };
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const _ = -1;
const BLACK = [0, 0, 0, 255];
const WHITE = [255, 255, 255, 255];
const RED = [255, 0, 0, 255];
const CLEAR = [0, 0, 0, 0];

describe('PNG export', () => {
  it('at 1x is one PNG pixel per drawing pixel, transparent where the drawing is', () => {
    const png = decodePng(
      exportPng(
        drawingOf([
          [0, 1, 2],
          [_, 2, 0],
        ]),
        1,
      ),
    );
    expect([png.width, png.height]).toEqual([3, 2]);
    expect(png.rgba).toEqual([BLACK, WHITE, RED, CLEAR, RED, BLACK]);
  });

  it('upscales by an integer factor with nearest-neighbour, so each pixel becomes a solid block', () => {
    const drawing = drawingOf([
      [0, 1, 2],
      [_, 2, 0],
    ]);
    const png = decodePng(exportPng(drawing, 2));
    expect([png.width, png.height]).toEqual([6, 4]);
    // prettier-ignore
    expect(png.rgba).toEqual([
      BLACK, BLACK, WHITE, WHITE, RED, RED,
      BLACK, BLACK, WHITE, WHITE, RED, RED,
      CLEAR, CLEAR, RED, RED, BLACK, BLACK,
      CLEAR, CLEAR, RED, RED, BLACK, BLACK,
    ]);

    for (const scale of [3, 8, 16]) {
      const big = decodePng(exportPng(drawing, scale));
      expect([big.width, big.height]).toEqual([3 * scale, 2 * scale]);
      const at = (x: number, y: number) => big.rgba[y * big.width + x];
      // The last row and column of the top-left block, and the first of its neighbours.
      expect(at(scale - 1, scale - 1)).toEqual(BLACK);
      expect(at(scale, scale - 1)).toEqual(WHITE);
      expect(at(scale - 1, scale)).toEqual(CLEAR);
      expect(at(3 * scale - 1, 2 * scale - 1)).toEqual(BLACK);
    }
  });

  it('exports the largest drawing at the largest scale', () => {
    const drawing = drawingOf(
      Array.from({ length: 64 }, (_, y) => Array.from({ length: 64 }, (_, x) => (x + y) % 3)),
    );
    const png = decodePng(exportPng(drawing, 16));
    expect([png.width, png.height]).toEqual([1024, 1024]);
    expect(png.rgba[0]).toEqual(BLACK);
    // Drawing pixel (63, 63) is color (63 + 63) % 3 = 0, and (62, 63) is 2.
    expect(png.rgba[1023 * 1024 + 1023]).toEqual(BLACK);
    expect(png.rgba[1023 * 1024 + 1007]).toEqual(RED);
  });

  it('compresses upscaled pixel art to a shareable file size', () => {
    // 64x64 pixels in 4-row stripes of two colors, with scattered single pixels of a third.
    const drawing = drawingOf(
      Array.from({ length: 64 }, (_, y) =>
        Array.from({ length: 64 }, (_, x) => ((x * 7 + y * 13) % 29 === 0 ? 2 : (y >> 2) % 2)),
      ),
    );
    const bytes = exportPng(drawing, 16);
    // 1024x1024 RGBA is 4 MiB uncompressed.
    expect(bytes.length).toBeLessThan(100_000);
    // Pixel (0, 0) is one of the scattered red ones.
    expect(decodePng(bytes).rgba[0]).toEqual(RED);
  });

  it('only accepts whole-number scales from 1x to 16x', () => {
    const drawing = drawingOf([[0]]);
    for (const scale of [0, 17, 1.5, -2, Number.NaN]) {
      expect(() => exportPng(drawing, scale)).toThrow(RangeError);
    }
  });
});

/** RGBA bytes for a list of [r, g, b, a] pixels. */
function rgbaData(pixels: number[][]) {
  return new Uint8ClampedArray(pixels.flat());
}

describe('opening an image', () => {
  it('makes its colors the palette, in the order they first appear, and alpha 0 transparent', () => {
    const drawing = drawingFromImage({
      width: 3,
      height: 2,
      data: rgbaData([
        [255, 0, 0, 255],
        [0, 0, 0, 0],
        [16, 32, 255, 255],
        [16, 32, 255, 255],
        [1, 2, 3, 0],
        [255, 0, 0, 255],
      ]),
    });
    expect([drawing.width, drawing.height]).toEqual([3, 2]);
    expect(drawing.palette).toEqual(['#ff0000', '#1020ff']);
    expect(rowsOf(drawing)).toEqual([
      [0, _, 1],
      [1, _, 0],
    ]);
  });

  it('opens an exported PNG as the drawing it came from', () => {
    const original = drawingOf([
      [0, 1, 2],
      [_, 2, 0],
    ]);
    const png = decodePng(exportPng(original, 1));
    const opened = drawingFromImage({ ...png, data: rgbaData(png.rgba) });
    expect(opened.palette).toEqual(['#000000', '#ffffff', '#ff0000']);
    expect(rowsOf(opened)).toEqual(rowsOf(original));
  });

  it('rejects images over 64x64 with a message that gives the size and the limit', () => {
    const blank = (width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    });
    expect(() => drawingFromImage(blank(65, 10))).toThrow(RangeError);
    expect(() => drawingFromImage(blank(65, 10))).toThrow(/65x10.*64x64/);
    expect(() => drawingFromImage(blank(64, 100))).toThrow(/64x100.*64x64/);
    expect(drawingFromImage(blank(64, 64)).width).toBe(64);
  });

  it('gives a fully transparent image the Studio palette, so there is a color to draw with', () => {
    const drawing = drawingFromImage({ width: 2, height: 1, data: new Uint8ClampedArray(8) });
    expect(drawing.palette).toEqual(STUDIO_PLACEHOLDER_PALETTE);
    expect(drawing.pixels).toEqual([_, _]);
  });
});
