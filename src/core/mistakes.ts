import { TRANSPARENT, type Color, type Drawing, type Point } from './drawing';
import { LOW_CONTRAST_DISTANCE } from './thresholds';

export const MISTAKE_KINDS = [
  'orphan-pixel',
  'doubles',
  'too-many-colors',
  'low-contrast',
] as const;
export type MistakeKind = (typeof MISTAKE_KINDS)[number];

export interface Mistake {
  readonly kind: MistakeKind;
  readonly pixels: readonly Point[];
}

const AROUND = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

function colorAt(drawing: Drawing, x: number, y: number): number | undefined {
  if (x < 0 || y < 0 || x >= drawing.width || y >= drawing.height) return undefined;
  return drawing.pixels[y * drawing.width + x];
}

function* opaquePixels(drawing: Drawing): Generator<Point & { readonly color: number }> {
  for (let y = 0; y < drawing.height; y++) {
    for (let x = 0; x < drawing.width; x++) {
      const color = drawing.pixels[y * drawing.width + x]!;
      if (color !== TRANSPARENT) yield { x, y, color };
    }
  }
}

function isOrphan(drawing: Drawing, { x, y, color }: Point & { color: number }): boolean {
  const around = new Set(
    AROUND.map(([dx, dy]) => colorAt(drawing, x + dx, y + dy)).filter((c) => c !== undefined),
  );
  return !around.has(color) && around.size === 1;
}

const L_CORNERS = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
] as const;

function isDouble(drawing: Drawing, p: Point & { color: number }): boolean {
  const at = (dx: number, dy: number) => colorAt(drawing, p.x + dx, p.y + dy) ?? TRANSPARENT;
  const is = (dx: number, dy: number) => at(dx, dy) === p.color;
  const open = (dx: number, dy: number) => at(dx, dy) === TRANSPARENT;
  return L_CORNERS.some(
    ([dx, dy]) =>
      is(dx, 0) &&
      is(0, dy) &&
      !is(dx, dy) &&
      !is(-dx, 0) &&
      !is(0, -dy) &&
      (open(dx, dy) || (open(-dx, 0) && open(0, -dy))) &&
      !(is(2 * dx, 0) && is(0, 2 * dy)),
  );
}

function pixelsWhere(
  drawing: Drawing,
  test: (drawing: Drawing, p: Point & { color: number }) => boolean,
): Point[] {
  return [...opaquePixels(drawing)].filter((p) => test(drawing, p)).map(({ x, y }) => ({ x, y }));
}

function overBudgetPixels(drawing: Drawing, colorBudget: number | undefined): Point[] {
  if (colorBudget === undefined) return [];
  const uses = new Map<number, number>();
  for (const { color } of opaquePixels(drawing)) uses.set(color, (uses.get(color) ?? 0) + 1);
  const kept = new Set(
    [...uses]
      .sort(([a, aUses], [b, bUses]) => bUses - aUses || a - b)
      .slice(0, colorBudget)
      .map(([color]) => color),
  );
  return pixelsWhere(drawing, (_, p) => !kept.has(p.color));
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function labOf(color: Color): readonly [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => linear(parseInt(color.slice(i, i + 2), 16))) as [
    number,
    number,
    number,
  ];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 / 116) * t + 16 / 116);
  const fx = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const fy = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const fz = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function colorDistance(a: Color, b: Color): number {
  const [l1, a1, b1] = labOf(a);
  const [l2, a2, b2] = labOf(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

const SIDES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function hasLowContrastEdge(drawing: Drawing, p: Point & { color: number }): boolean {
  return SIDES.some(([dx, dy]) => {
    const other = colorAt(drawing, p.x + dx, p.y + dy) ?? TRANSPARENT;
    return (
      other !== TRANSPARENT &&
      other !== p.color &&
      colorDistance(drawing.palette[p.color]!, drawing.palette[other]!) < LOW_CONTRAST_DISTANCE
    );
  });
}

export function findMistakes(drawing: Drawing, options: { colorBudget?: number } = {}): Mistake[] {
  const found: Mistake[] = [];
  const add = (kind: MistakeKind, pixels: Point[]) => {
    if (pixels.length > 0) found.push({ kind, pixels });
  };
  add('orphan-pixel', pixelsWhere(drawing, isOrphan));
  add('doubles', pixelsWhere(drawing, isDouble));
  add('too-many-colors', overBudgetPixels(drawing, options.colorBudget));
  add('low-contrast', pixelsWhere(drawing, hasLowContrastEdge));
  return found;
}
