import type { Drawing, Point } from './drawing';
import { colorAt, inReadingOrder, transposed } from './pixel-grid';

export const TILING_PREVIEW_REPEATS = 3;

export const EDGE_PAIRS = ['left-right', 'top-bottom'] as const;
export type EdgePair = (typeof EDGE_PAIRS)[number];

export function isEdgePair(value: unknown): value is EdgePair {
  return (EDGE_PAIRS as readonly unknown[]).includes(value);
}

export function tilingPreview(drawing: Drawing): Drawing {
  const width = drawing.width * TILING_PREVIEW_REPEATS;
  const height = drawing.height * TILING_PREVIEW_REPEATS;
  const pixels = Array.from({ length: width * height }, (_, i) => {
    const x = (i % width) % drawing.width;
    const y = Math.floor(i / width) % drawing.height;
    return drawing.pixels[y * drawing.width + x]!;
  });
  return { ...drawing, width, height, pixels };
}

function pairing(a: number, b: number): string {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

function leftRightSeam(drawing: Drawing): Point[] {
  const right = drawing.width - 1;
  const inside = new Set<string>();
  for (let y = 0; y < drawing.height; y++) {
    for (let x = 0; x < right; x++) {
      inside.add(pairing(colorAt(drawing, x, y)!, colorAt(drawing, x + 1, y)!));
    }
  }
  const seam: Point[] = [];
  for (let y = 0; y < drawing.height; y++) {
    if (!inside.has(pairing(colorAt(drawing, right, y)!, colorAt(drawing, 0, y)!))) {
      seam.push({ x: 0, y }, { x: right, y });
    }
  }
  return seam;
}

export function seamPixels(drawing: Drawing, seamless: readonly EdgePair[]): Point[] {
  const seams: Point[] = [];
  if (seamless.includes('left-right')) seams.push(...leftRightSeam(drawing));
  if (seamless.includes('top-bottom')) {
    seams.push(...leftRightSeam(transposed(drawing)).map(({ x, y }) => ({ x: y, y: x })));
  }
  return inReadingOrder(seams);
}
