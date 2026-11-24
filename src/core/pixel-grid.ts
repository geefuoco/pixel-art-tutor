import type { Drawing, Point } from './drawing';

export const OFF_CANVAS = undefined;

export function colorAt(drawing: Drawing, x: number, y: number): number | typeof OFF_CANVAS {
  if (x < 0 || y < 0 || x >= drawing.width || y >= drawing.height) return OFF_CANVAS;
  return drawing.pixels[y * drawing.width + x];
}

export function transposed(drawing: Drawing): Drawing {
  const pixels: number[] = [];
  for (let x = 0; x < drawing.width; x++) {
    for (let y = 0; y < drawing.height; y++) pixels.push(colorAt(drawing, x, y)!);
  }
  return { width: drawing.height, height: drawing.width, palette: drawing.palette, pixels };
}

export function inReadingOrder(points: Iterable<Point>): Point[] {
  const unique = new Map<string, Point>();
  for (const { x, y } of points) unique.set(`${x},${y}`, { x, y });
  return [...unique.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}
