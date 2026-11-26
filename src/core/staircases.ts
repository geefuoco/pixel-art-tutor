import { TRANSPARENT, type Drawing, type Point } from './drawing';
import { colorAt, transposed } from './pixel-grid';

export interface Run {
  readonly y: number;
  readonly from: number;
  readonly to: number;
  readonly color: number;
}

export type Staircase = readonly Run[];

export interface Axis {
  readonly runAt: (y: number, from: number, to: number) => Run | undefined;
  readonly staircases: readonly Staircase[];
  readonly pixelsOf: (run: Run) => Point[];
}

type StepDirection = 1 | -1;

function rowRuns(drawing: Drawing): Run[] {
  const runs: Run[] = [];
  for (let y = 0; y < drawing.height; y++) {
    let from = 0;
    for (let x = 1; x <= drawing.width; x++) {
      const color = colorAt(drawing, from, y)!;
      if (colorAt(drawing, x, y) === color) continue;
      if (color !== TRANSPARENT) runs.push({ y, from, to: x - 1, color });
      from = x;
    }
  }
  return runs;
}

function staircasesOf(runs: readonly Run[], direction: StepDirection): Staircase[] {
  const key = (y: number, x: number, color: number) => `${y},${x},${color}`;
  const byLeadingEnd = new Map<string, Run>();
  const byTrailingEnd = new Map<string, Run>();
  const leading = (run: Run) => (direction === 1 ? run.from : run.to);
  const trailing = (run: Run) => (direction === 1 ? run.to : run.from);
  for (const run of runs) {
    byLeadingEnd.set(key(run.y, leading(run), run.color), run);
    byTrailingEnd.set(key(run.y, trailing(run), run.color), run);
  }
  const next = (run: Run) => byLeadingEnd.get(key(run.y + 1, trailing(run) + direction, run.color));
  const startsAStaircase = (run: Run) =>
    !byTrailingEnd.has(key(run.y - 1, leading(run) - direction, run.color));
  return runs.filter(startsAStaircase).map((start) => {
    const staircase = [start];
    for (let run = next(start); run; run = next(run)) staircase.push(run);
    return staircase;
  });
}

function axisOf(drawing: Drawing, toCanvas: (p: Point) => Point): Axis {
  const runs = rowRuns(drawing);
  const byExtent = new Map(runs.map((run) => [`${run.y},${run.from},${run.to}`, run]));
  return {
    runAt: (y, from, to) => byExtent.get(`${y},${from},${to}`),
    staircases: [...staircasesOf(runs, 1), ...staircasesOf(runs, -1)],
    pixelsOf: (run) =>
      Array.from({ length: runLength(run) }, (_, i) => toCanvas({ x: run.from + i, y: run.y })),
  };
}

export function axes(drawing: Drawing): Axis[] {
  return [axisOf(drawing, (p) => p), axisOf(transposed(drawing), ({ x, y }) => ({ x: y, y: x }))];
}

export function runLength(run: Run): number {
  return run.to - run.from + 1;
}
