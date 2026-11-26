import {
  frameOfStep,
  type FramePose,
  type Lesson,
  type LessonStep,
  type StepKind,
} from '../core/lesson';

export const STEP_NAMES: Record<StepKind, string> = {
  silhouette: 'Silhouette',
  outline: 'Outline',
  base: 'Base colors',
  shadow: 'Shadow',
  highlight: 'Highlight',
};

const POSE_NAMES: Record<FramePose, string> = {
  key: 'key pose',
  'in-between': 'in-between',
};

export function stepName(step: LessonStep): string {
  if (step.kind === 'frame') return `Frame ${step.frame + 1}, ${POSE_NAMES[step.pose]}`;
  if (step.kind === 'tile') return step.name;
  return STEP_NAMES[step.kind];
}

export function tileName(lesson: Lesson, tile: number): string {
  const step = lesson.steps.find((s) => frameOfStep(s) === tile);
  return step ? stepName(step) : `Tile ${tile + 1}`;
}
