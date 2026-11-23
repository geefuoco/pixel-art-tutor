/** A palette color as a CSS hex string, e.g. `#1a1c2c`. */
export type Color = string;

/** Pixel value for "no color". Other pixel values are indexes into the palette. */
export const TRANSPARENT = -1;

export interface Drawing {
  readonly width: number;
  readonly height: number;
  readonly palette: readonly Color[];
  /** Row-major palette indexes, or TRANSPARENT. */
  readonly pixels: readonly number[];
}

/** The largest width or height a Drawing can have. */
export const MAX_DRAWING_SIZE = 64;

function isValidSize(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= MAX_DRAWING_SIZE;
}

/** A fully transparent Drawing. Throws a RangeError unless both sides are whole numbers from 1 to MAX_DRAWING_SIZE. */
export function createDrawing(options: {
  width: number;
  height: number;
  palette: readonly Color[];
}): Drawing {
  const { width, height, palette } = options;
  if (!isValidSize(width) || !isValidSize(height)) {
    throw new RangeError(
      `A drawing must be 1 to ${MAX_DRAWING_SIZE} pixels on each side, not ${width}x${height}`,
    );
  }
  return { width, height, palette, pixels: new Array<number>(width * height).fill(TRANSPARENT) };
}

function inBounds(drawing: Drawing, x: number, y: number): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < drawing.width &&
    y < drawing.height
  );
}

/** The palette index at (x, y), or TRANSPARENT. Throws a RangeError outside the canvas. */
export function getPixel(drawing: Drawing, x: number, y: number): number {
  if (!inBounds(drawing, x, y)) throw new RangeError(`Pixel (${x}, ${y}) is outside the canvas`);
  return drawing.pixels[y * drawing.width + x]!;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** An editor action. The UI changes pixels only by applying commands. */
export type Command =
  | { readonly type: 'pencil'; readonly color: number; readonly points: readonly Point[] }
  | { readonly type: 'eraser'; readonly points: readonly Point[] }
  /** Flood fill: recolors the 4-connected region of pixels sharing the color at `at`. */
  | { readonly type: 'fill'; readonly color: number; readonly at: Point };

/** Every pixel on the 1px path through the points, joining consecutive points with straight lines. */
function* strokePixels(points: readonly Point[]): Generator<Point> {
  for (let i = 0; i < points.length; i++) {
    const to = points[i]!;
    const from = points[i - 1];
    if (!from) {
      yield to;
      continue;
    }
    // Bresenham, skipping `from` since the previous segment already yielded it.
    const dx = Math.abs(to.x - from.x);
    const dy = -Math.abs(to.y - from.y);
    const sx = from.x < to.x ? 1 : -1;
    const sy = from.y < to.y ? 1 : -1;
    let { x, y } = from;
    let err = dx + dy;
    while (x !== to.x || y !== to.y) {
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
      yield { x, y };
    }
  }
}

/** Every pixel 4-connected to `start` through pixels of the same value. */
function* regionPixels(drawing: Drawing, start: Point): Generator<Point> {
  if (!inBounds(drawing, start.x, start.y)) return;
  const target = getPixel(drawing, start.x, start.y);
  const seen = new Set<number>([start.y * drawing.width + start.x]);
  const queue: Point[] = [start];
  for (let p = queue.pop(); p; p = queue.pop()) {
    yield p;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const x = p.x + dx;
      const y = p.y + dy;
      const i = y * drawing.width + x;
      if (inBounds(drawing, x, y) && !seen.has(i) && drawing.pixels[i] === target) {
        seen.add(i);
        queue.push({ x, y });
      }
    }
  }
}

function assertInPalette(drawing: Drawing, color: number) {
  if (!(Number.isInteger(color) && color >= 0 && color < drawing.palette.length)) {
    throw new RangeError(`Color ${color} is not in the palette`);
  }
}

/** Returns a new Drawing with the command applied; the input is never mutated. */
export function applyCommand(drawing: Drawing, command: Command): Drawing {
  if (command.type !== 'eraser') assertInPalette(drawing, command.color);
  const value = command.type === 'eraser' ? TRANSPARENT : command.color;
  const targets =
    command.type === 'fill' ? regionPixels(drawing, command.at) : strokePixels(command.points);
  const pixels = drawing.pixels.slice();
  for (const { x, y } of targets) {
    if (inBounds(drawing, x, y)) pixels[y * drawing.width + x] = value;
  }
  return { ...drawing, pixels };
}
