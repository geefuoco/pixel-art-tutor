import type { FramePose, LessonStep, StepKind } from '../core/lesson';

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
  return step.kind === 'frame'
    ? `Frame ${step.frame + 1}, ${POSE_NAMES[step.pose]}`
    : STEP_NAMES[step.kind];
}
