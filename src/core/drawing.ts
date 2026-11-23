export type Color = string;

export const TRANSPARENT = -1;

export interface Drawing {
  readonly width: number;
  readonly height: number;
  readonly palette: readonly Color[];
  readonly pixels: readonly number[];
}

export const MAX_DRAWING_SIZE = 64;

function isValidSize(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= MAX_DRAWING_SIZE;
}

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

export function getPixel(drawing: Drawing, x: number, y: number): number {
  if (!inBounds(drawing, x, y)) throw new RangeError(`Pixel (${x}, ${y}) is outside the canvas`);
  return drawing.pixels[y * drawing.width + x]!;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Clip {
  readonly width: number;
  readonly height: number;
  readonly pixels: readonly number[];
}

export function rectOnCanvas(drawing: Drawing, rect: Rect): Rect | null {
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  const width = Math.min(drawing.width, rect.x + rect.width) - x;
  const height = Math.min(drawing.height, rect.y + rect.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

export function rectBetween(drawing: Drawing, a: Point, b: Point): Rect {
  const clamp = (n: number, size: number) => Math.min(size - 1, Math.max(0, n));
  const [x0, x1] = [clamp(a.x, drawing.width), clamp(b.x, drawing.width)].sort((m, n) => m - n);
  const [y0, y1] = [clamp(a.y, drawing.height), clamp(b.y, drawing.height)].sort((m, n) => m - n);
  return { x: x0!, y: y0!, width: x1! - x0! + 1, height: y1! - y0! + 1 };
}

export function copyPixels(drawing: Drawing, rect: Rect): Clip {
  const r = rectOnCanvas(drawing, rect) ?? { x: 0, y: 0, width: 0, height: 0 };
  const pixels: number[] = [];
  for (let y = r.y; y < r.y + r.height; y++) {
    pixels.push(
      ...drawing.pixels.slice(y * drawing.width + r.x, y * drawing.width + r.x + r.width),
    );
  }
  return { width: r.width, height: r.height, pixels };
}

interface Mirrorable {
  readonly mirror?: boolean;
}

export type Command =
  | ({
      readonly type: 'pencil';
      readonly color: number;
      readonly points: readonly Point[];
    } & Mirrorable)
  | ({ readonly type: 'eraser'; readonly points: readonly Point[] } & Mirrorable)
  | ({ readonly type: 'fill'; readonly color: number; readonly at: Point } & Mirrorable)
  | { readonly type: 'move'; readonly from: Rect; readonly to: Point }
  | { readonly type: 'paste'; readonly clip: Clip; readonly at: Point };

function* strokePixels(points: readonly Point[]): Generator<Point> {
  for (let i = 0; i < points.length; i++) {
    const to = points[i]!;
    const from = points[i - 1];
    if (!from) {
      yield to;
      continue;
    }
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

function paste(drawing: Drawing, clip: Clip, at: Point): Drawing {
  const pixels = drawing.pixels.slice();
  clip.pixels.forEach((value, i) => {
    if (value === TRANSPARENT) return;
    assertInPalette(drawing, value);
    const x = at.x + (i % clip.width);
    const y = at.y + Math.floor(i / clip.width);
    if (inBounds(drawing, x, y)) pixels[y * drawing.width + x] = value;
  });
  return { ...drawing, pixels };
}

function move(drawing: Drawing, from: Rect, to: Point): Drawing {
  const r = rectOnCanvas(drawing, from);
  if (!r) return drawing;
  const clip = copyPixels(drawing, r);
  const pixels = drawing.pixels.slice();
  for (let y = r.y; y < r.y + r.height; y++) {
    pixels.fill(TRANSPARENT, y * drawing.width + r.x, y * drawing.width + r.x + r.width);
  }
  const at = { x: to.x + r.x - from.x, y: to.y + r.y - from.y };
  return paste({ ...drawing, pixels }, clip, at);
}

export function applyCommand(drawing: Drawing, command: Command): Drawing {
  if (command.type === 'move') return move(drawing, command.from, command.to);
  if (command.type === 'paste') return paste(drawing, command.clip, command.at);
  if (command.mirror) {
    const flip = (p: Point) => ({ x: drawing.width - 1 - p.x, y: p.y });
    const once = applyCommand(drawing, { ...command, mirror: false });
    return applyCommand(
      once,
      command.type === 'fill'
        ? { ...command, mirror: false, at: flip(command.at) }
        : { ...command, mirror: false, points: command.points.map(flip) },
    );
  }
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
