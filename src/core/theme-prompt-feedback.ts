import { TRANSPARENT, type Drawing } from './drawing';
import { findMistakes, type Mistake } from './mistakes';
import { colorAt } from './pixel-grid';
import {
  promptBundledPalette,
  themePromptPaletteText,
  type ConstraintCheck,
  type ThemePrompt,
} from './theme-prompt';

export type CheckOutcome = 'met' | 'unmet' | 'not-checked';

export interface PromptCheck {
  readonly label: string;
  readonly outcome: CheckOutcome;
}

export interface ThemePromptFeedback {
  readonly mistakes: readonly Mistake[];
  readonly checks: readonly PromptCheck[];
}

const DITHER_LENGTH = 4;
const DITHER_DEPTH = 2;

function usedColors(drawing: Drawing): Set<number> {
  return new Set(drawing.pixels.filter((p) => p !== TRANSPARENT));
}

function keepsToPalette(prompt: ThemePrompt, drawing: Drawing): boolean {
  const allowed = promptBundledPalette(prompt).colors.map((c) => c.toLowerCase());
  const used = [...usedColors(drawing)];
  return (
    used.length <= prompt.palette.colors &&
    used.every((color) => allowed.includes(drawing.palette[color]!.toLowerCase()))
  );
}

function checkerboardFrom(drawing: Drawing, x: number, y: number, transposed: boolean) {
  const at = (along: number, across: number) =>
    transposed ? colorAt(drawing, x + across, y + along) : colorAt(drawing, x + along, y + across);
  const [first, second] = [at(0, 0), at(1, 0)];
  if (first === undefined || second === undefined) return false;
  if (first === TRANSPARENT || second === TRANSPARENT || first === second) return false;
  for (let along = 0; along < DITHER_LENGTH; along++) {
    for (let across = 0; across < DITHER_DEPTH; across++) {
      if (at(along, across) !== ((along + across) % 2 === 0 ? first : second)) return false;
    }
  }
  return true;
}

function hasDithering(drawing: Drawing): boolean {
  for (let y = 0; y < drawing.height; y++) {
    for (let x = 0; x < drawing.width; x++) {
      if (checkerboardFrom(drawing, x, y, false) || checkerboardFrom(drawing, x, y, true)) {
        return true;
      }
    }
  }
  return false;
}

const CHECKS: Record<ConstraintCheck, (drawing: Drawing) => boolean> = {
  dithering: hasDithering,
};

function outcome(met: boolean): CheckOutcome {
  return met ? 'met' : 'unmet';
}

export function themePromptFeedback(prompt: ThemePrompt, drawing: Drawing): ThemePromptFeedback {
  const fitsSize = drawing.width === prompt.size && drawing.height === prompt.size;
  return {
    mistakes: findMistakes(drawing, { colorBudget: prompt.palette.colors }),
    checks: [
      { label: themePromptPaletteText(prompt), outcome: outcome(keepsToPalette(prompt, drawing)) },
      { label: `${prompt.size}x${prompt.size} canvas`, outcome: outcome(fitsSize) },
      ...prompt.constraints.map(({ text, check }) => ({
        label: text,
        outcome: check ? outcome(CHECKS[check](drawing)) : ('not-checked' as const),
      })),
    ],
  };
}
