import type { Drawing, Point } from './drawing';
import { inReadingOrder } from './pixel-grid';
import { axes, runLength, type Axis, type Staircase } from './staircases';
import { JAGGIES_MIN_LINE_RUNS } from './thresholds';

function breaksTheRhythm(lengths: readonly number[], i: number): boolean {
  const [before, here, after] = [lengths[i - 1], lengths[i]!, lengths[i + 1]];
  const standsOutBetweenEqualNeighbours = before === after && before !== here;
  const keepsAnAlternation = lengths[i - 2] === here || lengths[i + 2] === here;
  return standsOutBetweenEqualNeighbours && !keepsAnAlternation;
}

function jaggedRuns(staircase: Staircase, { pixelsOf }: Axis): Point[] {
  if (staircase.length < JAGGIES_MIN_LINE_RUNS) return [];
  const lengths = staircase.map(runLength);
  return staircase.flatMap((run, i) => (breaksTheRhythm(lengths, i) ? pixelsOf(run) : []));
}

export function jaggedPixels(drawing: Drawing): Point[] {
  return inReadingOrder(
    axes(drawing).flatMap((axis) => axis.staircases.flatMap((s) => jaggedRuns(s, axis))),
  );
}
