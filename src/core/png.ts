import { MAX_DRAWING_SIZE, TRANSPARENT, type Color, type Drawing } from './drawing';
import { STUDIO_PLACEHOLDER_PALETTE } from './palettes';

/** The largest factor a PNG export can upscale by. */
export const MAX_EXPORT_SCALE = 16;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

/** A PNG chunk: length, type, data and the CRC of type and data. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Writes bits least significant first, as deflate packs them. */
class BitWriter {
  private bytes = new Uint8Array(1024);
  private length = 0;
  private bitBuffer = 0;
  private bitCount = 0;

  /** The low `count` bits of `value`, least significant first. */
  bits(value: number, count: number) {
    this.bitBuffer |= value << this.bitCount;
    this.bitCount += count;
    while (this.bitCount >= 8) {
      this.byte(this.bitBuffer & 0xff);
      this.bitBuffer >>>= 8;
      this.bitCount -= 8;
    }
  }

  /** A Huffman code, which deflate stores most significant bit first. */
  code(code: number, count: number) {
    let reversed = 0;
    for (let i = 0; i < count; i++) reversed |= ((code >> i) & 1) << (count - 1 - i);
    this.bits(reversed, count);
  }

  finish(): Uint8Array {
    if (this.bitCount > 0) this.bits(0, 8 - this.bitCount);
    return this.bytes.subarray(0, this.length);
  }

  private byte(b: number) {
    if (this.length === this.bytes.length) {
      const grown = new Uint8Array(this.bytes.length * 2);
      grown.set(this.bytes);
      this.bytes = grown;
    }
    this.bytes[this.length++] = b;
  }
}

// Deflate's fixed Huffman code (RFC 1951, 3.2.6).
function writeSymbol(out: BitWriter, symbol: number) {
  if (symbol < 144) out.code(0x30 + symbol, 8);
  else if (symbol < 256) out.code(0x190 + symbol - 144, 9);
  else if (symbol < 280) out.code(symbol - 256, 7);
  else out.code(0xc0 + symbol - 280, 8);
}

const LENGTH_BASES = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LENGTH_EXTRA_BITS = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const MIN_MATCH = 3;
const MAX_MATCH = 258;

/**
 * A zlib stream holding one fixed-Huffman deflate block. Its only matches repeat the
 * byte just before them, which is all filtered pixel art needs: runs of one color
 * and repeated rows both filter to runs of zeros.
 */
function zlib(data: Uint8Array): Uint8Array {
  const out = new BitWriter();
  out.bits(0x78, 8);
  out.bits(0x01, 8);
  out.bits(1, 1); // Final block.
  out.bits(1, 2); // Fixed Huffman codes.
  let i = 0;
  while (i < data.length) {
    let run = 0;
    if (i > 0) {
      while (run < MAX_MATCH && i + run < data.length && data[i + run] === data[i - 1]) run++;
    }
    if (run < MIN_MATCH) {
      writeSymbol(out, data[i]!);
      i++;
      continue;
    }
    let code = LENGTH_BASES.length - 1;
    while (LENGTH_BASES[code]! > run) code--;
    writeSymbol(out, 257 + code);
    out.bits(run - LENGTH_BASES[code]!, LENGTH_EXTRA_BITS[code]!);
    out.code(0, 5); // Distance code 0: distance 1.
    i += run;
  }
  writeSymbol(out, 256); // End of block.
  const deflated = out.finish();

  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  const stream = new Uint8Array(deflated.length + 4);
  stream.set(deflated);
  new DataView(stream.buffer).setUint32(deflated.length, ((b << 16) | a) >>> 0);
  return stream;
}

const FILTER_SUB = 1;
const FILTER_UP = 2;

/**
 * The drawing as PNG file bytes (8-bit RGBA), each drawing pixel a `scale` x `scale`
 * block. Throws a RangeError unless `scale` is a whole number from 1 to MAX_EXPORT_SCALE.
 */
export function exportPng(drawing: Drawing, scale: number): Uint8Array {
  if (!(Number.isInteger(scale) && scale >= 1 && scale <= MAX_EXPORT_SCALE)) {
    throw new RangeError(
      `Export scale must be a whole number from 1 to ${MAX_EXPORT_SCALE}, not ${scale}`,
    );
  }
  const width = drawing.width * scale;
  const height = drawing.height * scale;
  const colors = drawing.palette.map((c) => [
    parseInt(c.slice(1, 3), 16),
    parseInt(c.slice(3, 5), 16),
    parseInt(c.slice(5, 7), 16),
    255,
  ]);
  const transparent = [0, 0, 0, 0];

  const rowBytes = width * 4;
  const filtered = new Uint8Array(height * (rowBytes + 1));
  let row = new Uint8Array(rowBytes);
  let above = new Uint8Array(rowBytes);
  for (let y = 0; y < height; y++) {
    [row, above] = [above, row];
    for (let x = 0; x < width; x++) {
      const value = drawing.pixels[Math.floor(y / scale) * drawing.width + Math.floor(x / scale)]!;
      row.set(colors[value] ?? transparent, x * 4);
    }
    const start = y * (rowBytes + 1);
    // A row repeating the one above filters to all zeros with Up; otherwise Sub
    // turns each run of one color into zeros after its first pixel.
    if (y % scale !== 0) {
      filtered[start] = FILTER_UP;
    } else {
      filtered[start] = FILTER_SUB;
      for (let i = 0; i < rowBytes; i++) {
        filtered[start + 1 + i] = (row[i]! - (i >= 4 ? row[i - 4]! : 0)) & 0xff;
      }
    }
  }

  const header = new Uint8Array([...uint32(width), ...uint32(height), 8, 6, 0, 0, 0]);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib(filtered)),
    chunk('IEND', new Uint8Array()),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

/**
 * Throws a RangeError, with a message to show the user, if an image of this size is
 * too big to open: over MAX_DRAWING_SIZE on either side. Lets a caller check before
 * it reads the pixels.
 */
export function checkImageSize(width: number, height: number): void {
  if (width > MAX_DRAWING_SIZE || height > MAX_DRAWING_SIZE) {
    throw new RangeError(
      `This image is ${width}x${height} pixels. Studio opens images up to ${MAX_DRAWING_SIZE}x${MAX_DRAWING_SIZE}.`,
    );
  }
}

/** Decoded image pixels, shaped like the DOM's ImageData: row-major RGBA bytes. */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayLike<number>;
}

function hex(n: number): string {
  return n.toString(16).padStart(2, '0');
}

/**
 * A Drawing of the image's pixels. Its palette is the image's colors in the order
 * they first appear, reading rows top to bottom. Fully transparent pixels become
 * transparent; any other alpha is drawn as the solid color. A fully transparent image
 * gets the Studio palette instead, so there is still a color to draw with.
 *
 * Throws as checkImageSize does for an image that is too big.
 */
export function drawingFromImage(image: RgbaImage): Drawing {
  const { width, height, data } = image;
  checkImageSize(width, height);
  const palette: Color[] = [];
  const indexes = new Map<Color, number>();
  const pixels: number[] = [];
  for (let i = 0; i < width * height; i++) {
    const [r, g, b, a] = [data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!, data[i * 4 + 3]!];
    if (a === 0) {
      pixels.push(TRANSPARENT);
      continue;
    }
    const color = `#${hex(r)}${hex(g)}${hex(b)}`;
    let index = indexes.get(color);
    if (index === undefined) {
      index = palette.push(color) - 1;
      indexes.set(color, index);
    }
    pixels.push(index);
  }
  return {
    width,
    height,
    palette: palette.length > 0 ? palette : STUDIO_PLACEHOLDER_PALETTE,
    pixels,
  };
}
