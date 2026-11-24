import { deltaE } from './color';
import { TRANSPARENT, type Drawing, type Point } from './drawing';
import { LOW_CONTRAST_DELTA_E } from './thresholds';

export type MistakeKind = 'orphan-pixel' | 'doubles' | 'too-many-colors' | 'low-contrast';

export interface Mistake {
  readonly kind: MistakeKind;
  readonly pixels: readonly Point[];
}

interface ColoredPixel extends Point {
  readonly color: number;
}

type Offset = readonly [dx: number, dy: number];

const SIDES: readonly Offset[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const DIAGONALS: readonly Offset[] = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

const NEIGHBOURS = [...SIDES, ...DIAGONALS];

const OFF_CANVAS = undefined;

function colorAt(drawing: Drawing, x: number, y: number): number | typeof OFF_CANVAS {
  if (x < 0 || y < 0 || x >= drawing.width || y >= drawing.height) return OFF_CANVAS;
  return drawing.pixels[y * drawing.width + x];
}

function* opaquePixels(drawing: Drawing): Generator<ColoredPixel> {
  for (let y = 0; y < drawing.height; y++) {
    for (let x = 0; x < drawing.width; x++) {
      const color = colorAt(drawing, x, y)!;
      if (color !== TRANSPARENT) yield { x, y, color };
    }
  }
}

function pixelsWhere(
  drawing: Drawing,
  test: (drawing: Drawing, pixel: ColoredPixel) => boolean,
): Point[] {
  return [...opaquePixels(drawing)]
    .filter((pixel) => test(drawing, pixel))
    .map(({ x, y }) => ({ x, y }));
}

function isOrphan(drawing: Drawing, { x, y }: ColoredPixel): boolean {
  return NEIGHBOURS.every(([dx, dy]) => {
    const neighbour = colorAt(drawing, x + dx, y + dy);
    return neighbour === OFF_CANVAS || neighbour === TRANSPARENT;
  });
}

function isDouble(drawing: Drawing, pixel: ColoredPixel): boolean {
  const at = (dx: number, dy: number) => colorAt(drawing, pixel.x + dx, pixel.y + dy);
  const same = (dx: number, dy: number) => at(dx, dy) === pixel.color;
  return DIAGONALS.some(([dx, dy]) => {
    const bendsIntoL = same(dx, 0) && same(0, dy) && !same(-dx, 0) && !same(0, -dy);
    const couldStepDiagonally = at(dx, dy) === TRANSPARENT;
    const joinsTwoStraightRuns = same(2 * dx, 0) && same(0, 2 * dy);
    return bendsIntoL && couldStepDiagonally && !joinsTwoStraightRuns;
  });
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
  return pixelsWhere(drawing, (_, pixel) => !kept.has(pixel.color));
}

function hasLowContrastEdge(drawing: Drawing, { x, y, color }: ColoredPixel): boolean {
  return SIDES.some(([dx, dy]) => {
    const other = colorAt(drawing, x + dx, y + dy);
    return (
      other !== OFF_CANVAS &&
      other !== TRANSPARENT &&
      other !== color &&
      deltaE(drawing.palette[color]!, drawing.palette[other]!) < LOW_CONTRAST_DELTA_E
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
