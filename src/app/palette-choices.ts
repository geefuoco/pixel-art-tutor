import type { Color } from '../core/drawing';
import { BUNDLED_PALETTES, STUDIO_STARTER_PALETTE, type CustomPalette } from '../core/palettes';

export interface PaletteChoice {
  readonly value: string;
  readonly label: string;
  readonly colors: readonly Color[];
}

export const STARTER_CHOICE: PaletteChoice = {
  value: 'starter',
  label: 'Studio starter',
  colors: STUDIO_STARTER_PALETTE,
};

export const BUNDLED_CHOICES: readonly PaletteChoice[] = BUNDLED_PALETTES.map((p) => ({
  value: `bundled:${p.id}`,
  label: `${p.name} by ${p.creator}`,
  colors: p.colors,
}));

export function customChoices(palettes: readonly CustomPalette[]): PaletteChoice[] {
  return palettes.map((p) => ({ value: `custom:${p.id}`, label: p.name, colors: p.colors }));
}

function sameColors(a: readonly Color[], b: readonly Color[]) {
  return a.length === b.length && a.every((c, i) => c === b[i]);
}

export function choiceMatching(
  choices: readonly PaletteChoice[],
  colors: readonly Color[],
): PaletteChoice {
  return choices.find((c) => sameColors(c.colors, colors)) ?? STARTER_CHOICE;
}
