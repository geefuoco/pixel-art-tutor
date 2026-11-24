import type { MistakeKind } from './mistakes';

export interface MistakeExplanation {
  readonly name: string;
  readonly explanation: string;
}

export const MISTAKE_EXPLANATIONS: Record<MistakeKind, MistakeExplanation> = {
  'orphan-pixel': {
    name: 'Orphan pixels',
    explanation:
      'An orphan pixel is a single pixel floating on its own, touching nothing else in the drawing. At 1x it reads as noise or dirt, not detail.\n\nRemove it, or join it to a shape it belongs to.',
  },
  jaggies: {
    name: 'Jaggies',
    explanation:
      'Jaggies are steps in a line that break its rhythm. A clean line is built from runs of pixels whose lengths stay the same, like 2, 2, 2, or change steadily, like 1, 2, 3 along a curve. One run that is suddenly shorter or longer than the runs on both sides of it shows up as a kink.\n\nMake the marked run match its neighbors, or ease the change in over several runs.',
  },
  doubles: {
    name: 'Doubles',
    explanation:
      'A double is an extra pixel in the corner of a line step. Where a 1px line moves diagonally, its pixels should touch only at their corners. A pixel filling the inside of the step turns it into an L, so the line looks thicker and lumpy there.\n\nErase the corner pixel so the step touches only diagonally.',
  },
  banding: {
    name: 'Banding',
    explanation:
      'Banding is when strips of different colors run side by side with their steps lined up exactly. Instead of blending, the strips read as one thick, blocky line, and the pixel grid shows through.\n\nOffset the steps of neighboring colors so they do not start and end in the same place, or merge the strips into fewer colors.',
  },
  'pillow-shading': {
    name: 'Pillow shading',
    explanation:
      'Pillow shading is shading in rings that follow the outline all the way around, dark at the edge and light in the middle. It ignores where the light comes from, so the shape looks flat and puffy instead of solid.\n\nPick a light direction. Put the highlight on the side facing it and the shadow on the side facing away, and let the base color fill the rest.',
  },
  'too-many-colors': {
    name: 'Too many colors',
    explanation:
      'This drawing uses more colors than its budget. A small palette keeps a sprite readable and consistent, and makes every color earn its place.\n\nThe marked pixels use the least used colors. Swap them for a color you already use, such as the nearest shade.',
  },
  'low-contrast': {
    name: 'Low contrast',
    explanation:
      'These neighboring colors are so close that at 1x they blur into one. The edge between them disappears, and so does whatever shape or shading it was meant to show.\n\nPush the two colors further apart in lightness, or merge them into one color.',
  },
};
