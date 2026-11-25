import { describe, expect, it } from 'vitest';
import { BUNDLED_PALETTES } from './palettes';
import { spriteOf } from './test-grids';
import {
  THEME_PROMPT_CONSTRAINTS,
  THEME_PROMPT_PALETTES,
  THEME_PROMPT_SUBJECTS,
  type ThemePrompt,
} from './theme-prompt';
import { themePromptFeedback } from './theme-prompt-feedback';

const SWEETIE_16 = BUNDLED_PALETTES.find((p) => p.id === 'sweetie-16')!.colors;

function constraint(id: string) {
  return THEME_PROMPT_CONSTRAINTS.find((c) => c.id === id)!;
}

function prompt(options: { size?: number; colors?: number; constraints?: string[] } = {}) {
  const { size = 8, colors = 3, constraints = ['light-top-left'] } = options;
  return {
    date: '2026-11-25',
    draw: 0,
    subject: THEME_PROMPT_SUBJECTS.find((s) => s.id === 'coin')!,
    size,
    palette: THEME_PROMPT_PALETTES.find((p) => p.id === `sweetie-16-${colors}`)!,
    constraints: constraints.map(constraint),
  } satisfies ThemePrompt;
}

const sweetie = (rows: string[]) => spriteOf(rows, 'abcdefghijklmnop', SWEETIE_16);

const COIN = sweetie([
  '........',
  '..aaaa..',
  '.aeeeea.',
  '.aeddea.',
  '.aeddea.',
  '.aeeeea.',
  '..aaaa..',
  '........',
]);

describe('Theme Prompt feedback', () => {
  it('lists the palette, the size and each constraint in the order the prompt gives them', () => {
    const feedback = themePromptFeedback(
      prompt({ constraints: ['light-top-left', 'side-view'] }),
      COIN,
    );
    expect(feedback.checks).toEqual([
      { label: '3 colors from Sweetie 16', outcome: 'met' },
      { label: '8x8 canvas', outcome: 'met' },
      { label: 'light from top-left', outcome: 'not-checked' },
      { label: 'side view', outcome: 'not-checked' },
    ]);
  });

  it('marks the palette unmet and flags too many colors when the drawing goes over the count', () => {
    const fourColors = sweetie([
      '........',
      '..aaaa..',
      '.aeeeea.',
      '.aeddea.',
      '.aedkea.',
      '.aeeeea.',
      '..aaaa..',
      '........',
    ]);
    const feedback = themePromptFeedback(prompt({ colors: 3 }), fourColors);
    expect(feedback.checks[0]).toEqual({ label: '3 colors from Sweetie 16', outcome: 'unmet' });
    expect(feedback.mistakes).toContainEqual({ kind: 'too-many-colors', pixels: [{ x: 4, y: 4 }] });
  });

  it('marks the palette unmet when a color is not from the Bundled Palette', () => {
    const offPalette = { ...COIN, palette: COIN.palette.map((c, i) => (i === 3 ? '#123456' : c)) };
    expect(themePromptFeedback(prompt(), offPalette).checks[0]!.outcome).toBe('unmet');
  });

  it('marks the size unmet on a canvas of another size', () => {
    const sixteen = sweetie(Array.from({ length: 16 }, () => '.'.repeat(16)));
    expect(themePromptFeedback(prompt({ size: 8 }), sixteen).checks[1]).toEqual({
      label: '8x8 canvas',
      outcome: 'unmet',
    });
  });

  it('finds dithering as a run of two colors that alternate, across or down', () => {
    const across = sweetie(['dddddddd', 'dedededd', 'eeeeeeee']);
    const down = sweetie(['de.', 'ee.', 'de.', 'ee.']);
    const flat = sweetie(['dddddddd', 'dddddddd', 'eeeeeeee']);
    const tooShort = sweetie(['ddddddd', 'ddeddee', 'eeeeeee']);
    const dithered = (drawing: typeof across) =>
      themePromptFeedback(prompt({ size: 16, colors: 4, constraints: ['dithering'] }), drawing)
        .checks[2];
    expect(dithered(across)).toEqual({ label: 'include dithering', outcome: 'met' });
    expect(dithered(down)!.outcome).toBe('met');
    expect(dithered(flat)!.outcome).toBe('unmet');
    expect(dithered(tooShort)!.outcome).toBe('unmet');
  });

  it('has no Mistakes for a clean drawing that keeps to the palette', () => {
    const flatCoin = sweetie([
      '........',
      '..aaaa..',
      '.aeeeea.',
      '.aeeeea.',
      '.aeeeea.',
      '.aeeeea.',
      '..aaaa..',
      '........',
    ]);
    expect(themePromptFeedback(prompt(), flatCoin).mistakes).toEqual([]);
  });
});
