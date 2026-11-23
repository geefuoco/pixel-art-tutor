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

export function createDrawing(options: {
  width: number;
  height: number;
  palette: readonly Color[];
}): Drawing {
  const { width, height, palette } = options;
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
  | { readonly type: 'eraser'; readonly points: readonly Point[] };

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

/** Returns a new Drawing with the command applied; the input is never mutated. */
export function applyCommand(drawing: Drawing, command: Command): Drawing {
  const value = command.type === 'pencil' ? command.color : TRANSPARENT;
  if (
    command.type === 'pencil' &&
    !(Number.isInteger(value) && value >= 0 && value < drawing.palette.length)
  ) {
    throw new RangeError(`Color ${value} is not in the palette`);
  }
  const pixels = drawing.pixels.slice();
  for (const { x, y } of strokePixels(command.points)) {
    if (inBounds(drawing, x, y)) pixels[y * drawing.width + x] = value;
  }
  return { ...drawing, pixels };
}
