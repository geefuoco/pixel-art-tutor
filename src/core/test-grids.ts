import type { Drawing } from './drawing';

export function drawingOf(rows: number[][], palette = ['#000000', '#ffffff', '#ff0000']): Drawing {
  return { width: rows[0]!.length, height: rows.length, palette, pixels: rows.flat() };
}

export function spriteOf(
  rows: readonly string[],
  legend: string,
  palette: readonly string[],
): Drawing {
  return {
    width: rows[0]!.length,
    height: rows.length,
    palette,
    pixels: rows.flatMap((row) => [...row].map((c) => (c === '.' ? -1 : legend.indexOf(c)))),
  };
}

export function rowsOf(d: Drawing): number[][] {
  return Array.from({ length: d.height }, (_, y) => d.pixels.slice(y * d.width, (y + 1) * d.width));
}
