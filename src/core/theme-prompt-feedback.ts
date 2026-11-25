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

const DITHER_RUN = 4;

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

function alternatesFrom(drawing: Drawing, x: number, y: number, dx: number, dy: number) {
  const at = (step: number) => colorAt(drawing, x + dx * step, y + dy * step);
  const [first, second] = [at(0), at(1)];
  if (first === undefined || second === undefined) return false;
  if (first === TRANSPARENT || second === TRANSPARENT || first === second) return false;
  return Array.from({ length: DITHER_RUN }, (_, step) => at(step)).every(
    (color, step) => color === (step % 2 === 0 ? first : second),
  );
}

function hasDithering(drawing: Drawing): boolean {
  for (let y = 0; y < drawing.height; y++) {
    for (let x = 0; x < drawing.width; x++) {
      if (alternatesFrom(drawing, x, y, 1, 0) || alternatesFrom(drawing, x, y, 0, 1)) return true;
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
