import type { Drawing, Point } from './drawing';
import { inReadingOrder } from './pixel-grid';
import { axes, type Axis, type Run, type Staircase } from './staircases';
import { BANDING_MIN_ALIGNED_RUNS } from './thresholds';

function alignedBand(run: Run, side: 1 | -1, { runAt }: Axis): Run | undefined {
  const band = runAt(run.y + side, run.from, run.to);
  return band && band.color !== run.color ? band : undefined;
}

function bandedRuns(staircase: Staircase, axis: Axis, side: 1 | -1): Point[] {
  const flagged: Point[] = [];
  let stretch: (readonly [Run, Run])[] = [];
  const endStretch = () => {
    if (stretch.length >= BANDING_MIN_ALIGNED_RUNS) {
      flagged.push(...stretch.flat().flatMap(axis.pixelsOf));
    }
    stretch = [];
  };
  for (const run of staircase) {
    const band = alignedBand(run, side, axis);
    if (band) stretch.push([run, band]);
    else endStretch();
  }
  endStretch();
  return flagged;
}

export function bandedPixels(drawing: Drawing): Point[] {
  return inReadingOrder(
    axes(drawing).flatMap((axis) =>
      axis.staircases.flatMap((s) => [...bandedRuns(s, axis, 1), ...bandedRuns(s, axis, -1)]),
    ),
  );
}
