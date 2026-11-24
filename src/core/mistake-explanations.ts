import type { MistakeKind } from './mistakes';

export interface MistakeExplanation {
  readonly name: string;
  readonly explanation: string;
}

export const MISTAKE_EXPLANATIONS: Record<MistakeKind, MistakeExplanation> = {
  'orphan-pixel': {
    name: 'Orphan pixels',
    explanation:
      'An orphan pixel is a single pixel on its own: floating away from the sprite, or a lone speck of another color in the middle of a flat area. At 1x it reads as noise or dirt, not detail.\n\nRemove it, or grow it into a small cluster that belongs to a shape.',
  },
  doubles: {
    name: 'Doubles',
    explanation:
      'A double is an extra pixel in the corner of a line step. Where a 1px line moves diagonally, its pixels should touch only at their corners. A pixel filling the inside of the step turns it into an L, so the line looks thicker and lumpy there.\n\nErase the corner pixel so the step touches only diagonally.',
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
