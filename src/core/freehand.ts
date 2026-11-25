import { frameDrawing, type Animation } from './animation';
import { TRANSPARENT, type Drawing, type Point, type Rect } from './drawing';
import { seamlessEdgesOfFrame, type Lesson, type Role } from './lesson';
import { findMistakes, type Mistake } from './mistakes';
import { inReadingOrder } from './pixel-grid';
import { FREEHAND_SCALE_TOLERANCE } from './thresholds';

export interface FreehandSubScores {
  readonly shape: number;
  readonly palette: number;
  readonly lineQuality: number;
}

export interface FreehandScore extends FreehandSubScores {
  readonly overall: number;
  readonly mistakes: readonly (readonly Mistake[])[];
}

interface FrameScore extends FreehandSubScores {
  readonly overall: number;
  readonly mistakes: readonly Mistake[];
}

interface Alignment {
  readonly sprite: Drawing;
  readonly at: Point;
  readonly iou: number;
}

function boundingBox(drawing: Drawing): Rect | null {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  drawing.pixels.forEach((p, i) => {
    if (p === TRANSPARENT) return;
    const x = i % drawing.width;
    const y = Math.floor(i / drawing.width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  });
  if (right < left) return null;
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function cropped(drawing: Drawing, box: Rect): Drawing {
  return resampled(drawing, box, box.width, box.height);
}

function resampled(drawing: Drawing, from: Rect, width: number, height: number): Drawing {
  const pixels = Array.from({ length: width * height }, (_, i) => {
    const x = from.x + Math.floor(((i % width) * from.width) / width);
    const y = from.y + Math.floor((Math.floor(i / width) * from.height) / height);
    return drawing.pixels[y * drawing.width + x]!;
  });
  return { width, height, palette: drawing.palette, pixels };
}

function scaleChanges(): Point[] {
  const range = Array.from(
    { length: 2 * FREEHAND_SCALE_TOLERANCE + 1 },
    (_, i) => i - FREEHAND_SCALE_TOLERANCE,
  );
  return range
    .flatMap((x) => range.map((y) => ({ x, y })))
    .sort((a, b) => Math.abs(a.x) + Math.abs(a.y) - (Math.abs(b.x) + Math.abs(b.y)));
}

function scaledSprites(reference: Drawing): Drawing[] {
  const box = boundingBox(reference);
  if (!box) return [];
  const sprite = cropped(reference, box);
  const whole = { x: 0, y: 0, width: sprite.width, height: sprite.height };
  return scaleChanges()
    .map(({ x, y }) => ({ width: sprite.width + x, height: sprite.height + y }))
    .filter(({ width, height }) => width >= 1 && height >= 1)
    .map(({ width, height }) => resampled(sprite, whole, width, height));
}

function opaquePoints(drawing: Drawing): Point[] {
  return drawing.pixels.flatMap((p, i) =>
    p === TRANSPARENT ? [] : [{ x: i % drawing.width, y: Math.floor(i / drawing.width) }],
  );
}

function isOpaqueAt(drawing: Drawing, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= drawing.width || y >= drawing.height) return false;
  return drawing.pixels[y * drawing.width + x] !== TRANSPARENT;
}

interface PaddedMask {
  readonly opaque: Uint8Array;
  readonly width: number;
  readonly padding: number;
  readonly count: number;
}

function paddedMask(drawing: Drawing, padding: number): PaddedMask {
  const width = drawing.width + 2 * padding;
  const opaque = new Uint8Array(width * (drawing.height + 2 * padding));
  let count = 0;
  for (const { x, y } of opaquePoints(drawing)) {
    opaque[(y + padding) * width + x + padding] = 1;
    count++;
  }
  return { opaque, width, padding, count };
}

function bestPlacement(sprite: Drawing, mask: PaddedMask, drawingBox: Rect): Alignment {
  const offsets = opaquePoints(sprite).map((p) => p.y * mask.width + p.x);
  let best: Alignment = { sprite, at: { x: 0, y: 0 }, iou: 0 };
  for (let y = drawingBox.y - sprite.height + 1; y < drawingBox.y + drawingBox.height; y++) {
    for (let x = drawingBox.x - sprite.width + 1; x < drawingBox.x + drawingBox.width; x++) {
      const origin = (y + mask.padding) * mask.width + x + mask.padding;
      let overlap = 0;
      for (const offset of offsets) overlap += mask.opaque[origin + offset]!;
      const iou = overlap / (offsets.length + mask.count - overlap);
      if (iou > best.iou) best = { sprite, at: { x, y }, iou };
    }
  }
  return best;
}

function bestPossibleIou(sprite: Drawing, mask: PaddedMask): number {
  const spriteCount = sprite.pixels.filter((p) => p !== TRANSPARENT).length;
  return Math.min(spriteCount, mask.count) / Math.max(spriteCount, mask.count);
}

function bestAlignment(reference: Drawing, drawing: Drawing): Alignment | null {
  const drawingBox = boundingBox(drawing);
  const sprites = scaledSprites(reference);
  if (!drawingBox || sprites.length === 0) return null;
  const mask = paddedMask(drawing, Math.max(...sprites.map((s) => Math.max(s.width, s.height))));
  let best: Alignment | null = null;
  for (const sprite of sprites) {
    if (best && bestPossibleIou(sprite, mask) <= best.iou) continue;
    const placed = bestPlacement(sprite, mask, drawingBox);
    if (!best || placed.iou > best.iou) best = placed;
  }
  return best;
}

function lessonRoleOf(lesson: Lesson, drawing: Drawing): (color: number) => Role | undefined {
  const lessonColors = lesson.palette.map((c) => c.toLowerCase());
  return (color) => {
    const index = lessonColors.indexOf(drawing.palette[color]!.toLowerCase());
    return index < 0 ? undefined : lesson.roles[index];
  };
}

function paletteScore(lesson: Lesson, drawing: Drawing, alignment: Alignment): number {
  const roleOf = lessonRoleOf(lesson, drawing);
  const drawn = opaquePoints(drawing);
  let onPalette = 0;
  let overlapping = 0;
  let rightRole = 0;
  for (const p of drawn) {
    const role = roleOf(drawing.pixels[p.y * drawing.width + p.x]!);
    if (role !== undefined) onPalette++;
    const x = p.x - alignment.at.x;
    const y = p.y - alignment.at.y;
    if (role === undefined || !isOpaqueAt(alignment.sprite, x, y)) continue;
    overlapping++;
    if (lesson.roles[alignment.sprite.pixels[y * alignment.sprite.width + x]!] === role) {
      rightRole++;
    }
  }
  if (overlapping === 0) return 0;
  return (onPalette / drawn.length) * (rightRole / overlapping);
}

function lineQualityScore(drawing: Drawing, mistakes: readonly Mistake[]): number {
  const drawnCount = drawing.pixels.filter((p) => p !== TRANSPARENT).length;
  const flagged = inReadingOrder(mistakes.flatMap((m) => m.pixels)).length;
  return 1 - flagged / drawnCount;
}

function scoreFrame(lesson: Lesson, frame: number, drawing: Drawing): FrameScore {
  const alignment = bestAlignment(frameDrawing(lesson.animation, frame), drawing);
  if (!alignment) return { shape: 0, palette: 0, lineQuality: 0, overall: 0, mistakes: [] };
  const mistakes = findMistakes(drawing, {
    colorBudget: lesson.palette.length,
    seamless: seamlessEdgesOfFrame(lesson, frame),
  });
  const subScores = {
    shape: alignment.iou,
    palette: paletteScore(lesson, drawing, alignment),
    lineQuality: lineQualityScore(drawing, mistakes),
  };
  const overall = (subScores.shape + subScores.palette + subScores.lineQuality) / 3;
  return { ...subScores, overall, mistakes };
}

const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;

export function scoreFreehand(lesson: Lesson, attempt: Animation): FreehandScore {
  const frames = lesson.animation.frames.map((_, frame) =>
    scoreFrame(
      lesson,
      frame,
      attempt.frames[frame]
        ? frameDrawing(attempt, frame)
        : { ...frameDrawing(attempt, 0), pixels: attempt.frames[0]!.map(() => TRANSPARENT) },
    ),
  );
  return {
    shape: mean(frames.map((f) => f.shape)),
    palette: mean(frames.map((f) => f.palette)),
    lineQuality: mean(frames.map((f) => f.lineQuality)),
    overall: mean(frames.map((f) => f.overall)),
    mistakes: frames.map((f) => f.mistakes),
  };
}
