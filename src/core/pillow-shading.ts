import { lightness } from './color';
import type { Drawing, Point } from './drawing';
import { inReadingOrder, isOpaque, NEIGHBOURS, SIDES } from './pixel-grid';
import { PILLOW_MIN_LAYER_PIXELS, PILLOW_MIN_LAYERS, PILLOW_RING_SHARE } from './thresholds';

interface DepthPixel extends Point {
  readonly color: number;
  readonly depth: number;
}

interface Layer {
  readonly color: number;
  readonly pixels: Point[];
}

function depthsFromEdge(drawing: Drawing): Map<number, number> {
  const depths = new Map<number, number>();
  let frontier: Point[] = [];
  for (let y = 0; y < drawing.height; y++) {
    for (let x = 0; x < drawing.width; x++) {
      const onEdge = SIDES.some(([dx, dy]) => !isOpaque(drawing, x + dx, y + dy));
      if (isOpaque(drawing, x, y) && onEdge) {
        depths.set(y * drawing.width + x, 1);
        frontier.push({ x, y });
      }
    }
  }
  for (let depth = 2; frontier.length > 0; depth++) {
    const next: Point[] = [];
    for (const { x, y } of frontier) {
      for (const [dx, dy] of SIDES) {
        const i = (y + dy) * drawing.width + x + dx;
        if (isOpaque(drawing, x + dx, y + dy) && !depths.has(i)) {
          depths.set(i, depth);
          next.push({ x: x + dx, y: y + dy });
        }
      }
    }
    frontier = next;
  }
  return depths;
}

function shapes(drawing: Drawing): DepthPixel[][] {
  const depths = depthsFromEdge(drawing);
  const seen = new Set<number>();
  const found: DepthPixel[][] = [];
  for (const start of depths.keys()) {
    if (seen.has(start)) continue;
    seen.add(start);
    const shape: DepthPixel[] = [];
    const queue = [start];
    for (let i = queue.pop(); i !== undefined; i = queue.pop()) {
      const x = i % drawing.width;
      const y = Math.floor(i / drawing.width);
      shape.push({ x, y, color: drawing.pixels[i]!, depth: depths.get(i)! });
      for (const [dx, dy] of NEIGHBOURS) {
        const j = (y + dy) * drawing.width + x + dx;
        if (isOpaque(drawing, x + dx, y + dy) && !seen.has(j)) {
          seen.add(j);
          queue.push(j);
        }
      }
    }
    found.push(shape);
  }
  return found;
}

function dominantColor(ring: readonly DepthPixel[]): number | undefined {
  const counts = new Map<number, number>();
  for (const { color } of ring) counts.set(color, (counts.get(color) ?? 0) + 1);
  const [color, count] = [...counts].sort(([, a], [, b]) => b - a)[0]!;
  return count / ring.length >= PILLOW_RING_SHARE ? color : undefined;
}

function concentricLayers(shape: readonly DepthPixel[]): Layer[][] {
  const deepest = Math.max(...shape.map((p) => p.depth));
  const uniformRingStretches: Layer[][] = [[]];
  for (let depth = 1; depth <= deepest; depth++) {
    const ring = shape.filter((p) => p.depth === depth);
    const color = dominantColor(ring);
    const current = uniformRingStretches.at(-1)!;
    if (color === undefined) {
      uniformRingStretches.push([]);
      continue;
    }
    const pixels = ring.filter((p) => p.color === color).map(({ x, y }) => ({ x, y }));
    const last = current.at(-1);
    if (last?.color === color) last.pixels.push(...pixels);
    else current.push({ color, pixels });
  }
  return uniformRingStretches;
}

function shadesSteadilyInward(drawing: Drawing, shading: readonly Layer[]): boolean {
  const steps = shading
    .slice(1)
    .map((layer, i) =>
      Math.sign(
        lightness(drawing.palette[layer.color]!) - lightness(drawing.palette[shading[i]!.color]!),
      ),
    );
  return steps.every((step) => step !== 0 && step === steps[0]);
}

function pillowShadedPixelsOf(drawing: Drawing, shape: readonly DepthPixel[]): Point[] {
  return concentricLayers(shape)
    .map((layers) => layers.filter((layer) => layer.pixels.length >= PILLOW_MIN_LAYER_PIXELS))
    .filter((layers) => layers.length >= PILLOW_MIN_LAYERS)
    .map((layers) => layers.slice(1))
    .filter((shading) => shadesSteadilyInward(drawing, shading))
    .flatMap((shading) => shading.flatMap((layer) => layer.pixels));
}

export function pillowShadedPixels(drawing: Drawing): Point[] {
  return inReadingOrder(shapes(drawing).flatMap((shape) => pillowShadedPixelsOf(drawing, shape)));
}
