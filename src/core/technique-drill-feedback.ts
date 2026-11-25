import { TRANSPARENT, type Drawing, type Point } from './drawing';
import { roleOfColor, type Role } from './lesson';
import { findMistakes, type Mistake } from './mistakes';
import { isOpaque, SIDES } from './pixel-grid';
import type { DrillCheck, LightDirection, TechniqueDrill } from './technique-drill';
import { outcome, type PromptCheck, type PromptFeedback } from './theme-prompt-feedback';
import { LIGHT_SIDE_MIN_OFFSET } from './thresholds';
import type { EdgePair } from './tiling';

interface RolePixel extends Point {
  readonly role: Role | undefined;
}

const LIGHT_NAMES: Record<LightDirection, string> = {
  'top-left': 'the top left',
  'top-right': 'the top right',
  above: 'above',
  left: 'the left',
  right: 'the right',
};

const LIGHT_VECTORS: Record<LightDirection, Point> = {
  'top-left': { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  'top-right': { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  above: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const EDGE_NAMES: Record<EdgePair, string> = {
  'left-right': 'left to right',
  'top-bottom': 'top to bottom',
};

function rolePixels(drill: TechniqueDrill, drawing: Drawing): RolePixel[] {
  const roleOf = roleOfColor(drill.start.palette, drill.roles, drawing);
  return drawing.pixels.flatMap((color, i) =>
    color === TRANSPARENT
      ? []
      : [{ x: i % drawing.width, y: Math.floor(i / drawing.width), role: roleOf(color) }],
  );
}

function towardsLight(drill: TechniqueDrill, pixels: readonly RolePixel[], role: Role): number {
  const light = LIGHT_VECTORS[drill.light!];
  const lit = pixels.filter((p) => p.role === role);
  if (lit.length === 0) return 0;
  const centre = {
    x: pixels.reduce((sum, p) => sum + p.x, 0) / pixels.length,
    y: pixels.reduce((sum, p) => sum + p.y, 0) / pixels.length,
  };
  const offsets = lit.map((p) => (p.x - centre.x) * light.x + (p.y - centre.y) * light.y);
  return offsets.reduce((sum, offset) => sum + offset, 0) / offsets.length;
}

function touchesOutside(drawing: Drawing, { x, y }: Point): boolean {
  return SIDES.some(([dx, dy]) => !isOpaque(drawing, x + dx, y + dy));
}

function closesOutline(drawing: Drawing, pixels: readonly RolePixel[]): boolean {
  const edge = pixels.filter((p) => touchesOutside(drawing, p));
  return edge.length > 0 && edge.every((p) => p.role === 'outline');
}

function startsThickBlock(outline: ReadonlySet<string>, { x, y }: Point): boolean {
  return [
    [1, 0],
    [0, 1],
    [1, 1],
  ].every(([dx, dy]) => outline.has(`${x + dx!},${y + dy!}`));
}

function hasCleanOutline(
  drawing: Drawing,
  pixels: readonly RolePixel[],
  mistakes: readonly Mistake[],
): boolean {
  const outline = pixels.filter((p) => p.role === 'outline');
  const keys = new Set(outline.map(({ x, y }) => `${x},${y}`));
  const jagged = new Set(
    mistakes
      .filter((m) => m.kind === 'jaggies')
      .flatMap((m) => m.pixels.map(({ x, y }) => `${x},${y}`)),
  );
  return (
    outline.some((p) => touchesOutside(drawing, p)) &&
    !outline.some((p) => startsThickBlock(keys, p) || jagged.has(`${p.x},${p.y}`))
  );
}

function lightLabel(drill: TechniqueDrill): string {
  return `(from ${LIGHT_NAMES[drill.light!]})`;
}

function check(
  drill: TechniqueDrill,
  kind: DrillCheck,
  drawing: Drawing,
  pixels: readonly RolePixel[],
  mistakes: readonly Mistake[],
): PromptCheck {
  switch (kind) {
    case 'shadow-away-from-light':
      return {
        label: `Shadow away from the light ${lightLabel(drill)}`,
        outcome: outcome(towardsLight(drill, pixels, 'shadow') <= -LIGHT_SIDE_MIN_OFFSET),
      };
    case 'highlight-toward-light':
      return {
        label: `Highlight facing the light ${lightLabel(drill)}`,
        outcome: outcome(towardsLight(drill, pixels, 'highlight') >= LIGHT_SIDE_MIN_OFFSET),
      };
    case 'closed-outline':
      return {
        label: 'The outline goes all the way round',
        outcome: outcome(closesOutline(drawing, pixels)),
      };
    case 'clean-outline':
      return {
        label: 'The outline is 1 pixel wide, with no jaggies',
        outcome: outcome(hasCleanOutline(drawing, pixels, mistakes)),
      };
    case 'seamless':
      return {
        label: `Repeats ${drill.seamless.map((pair) => EDGE_NAMES[pair]).join(' and ')} without a seam`,
        outcome: outcome(!mistakes.some((m) => m.kind === 'seam')),
      };
  }
}

export function techniqueDrillFeedback(drill: TechniqueDrill, drawing: Drawing): PromptFeedback {
  const mistakes = findMistakes(drawing, {
    colorBudget: drill.start.palette.length,
    seamless: drill.seamless,
  });
  const pixels = rolePixels(drill, drawing);
  return {
    mistakes,
    checks: drill.checks.map((kind) => check(drill, kind, drawing, pixels, mistakes)),
  };
}
