import type { Drawing, Point } from './drawing';
import { inReadingOrder } from './pixel-grid';
import { axes, runLength, type Axis, type Run, type Staircase } from './staircases';
import { BANDING_MIN_ALIGNED_RUNS } from './thresholds';

type NeighbouringLine = 1 | -1;

type AlignedPair = readonly [line: Run, band: Run];

function alignedBand(run: Run, side: NeighbouringLine, { runAt }: Axis): Run | undefined {
  const band = runAt(run.y + side, run.from, run.to);
  return band && band.color !== run.color ? band : undefined;
}

function isBanding(pairs: readonly AlignedPair[]): boolean {
  const stepsWiderThanAPixel = pairs.some(([line]) => runLength(line) > 1);
  return pairs.length >= BANDING_MIN_ALIGNED_RUNS && stepsWiderThanAPixel;
}

function bandedRuns(staircase: Staircase, axis: Axis, side: NeighbouringLine): Point[] {
  const flagged: Point[] = [];
  let pairs: AlignedPair[] = [];
  const endStretch = () => {
    if (isBanding(pairs)) flagged.push(...pairs.flat().flatMap(axis.pixelsOf));
    pairs = [];
  };
  for (const run of staircase) {
    const band = alignedBand(run, side, axis);
    if (band) pairs.push([run, band]);
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
