import { describe, expect, it } from 'vitest';
import { addDays } from './calendar-date';
import { BUNDLED_PALETTES } from './palettes';
import {
  THEME_PROMPT_CONSTRAINTS,
  THEME_PROMPT_PALETTES,
  THEME_PROMPT_SIZES,
  THEME_PROMPT_SUBJECTS,
  themePrompt,
  themePromptText,
  type ThemePrompt,
} from './theme-prompt';

function dates(from: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(from, i));
}

const SAMPLE: ThemePrompt[] = dates('2026-01-01', 3650).flatMap((date) =>
  [0, 1, 2].map((draw) => themePrompt(date, draw)),
);

function partsOf(prompt: ThemePrompt) {
  return [prompt.subject, prompt.palette, ...prompt.constraints];
}

describe('Theme Prompt generator', () => {
  it('gives every visitor the same prompt for a date', () => {
    expect(themePrompt('2026-11-25')).toEqual(themePrompt('2026-11-25'));
    expect(themePromptText(themePrompt('2026-11-25', 3))).toBe(
      themePromptText(themePrompt('2026-11-25', 3)),
    );
  });

  it('reads like a brief: size, subject, palette, then constraints', () => {
    const text = themePromptText(themePrompt('2026-11-25'));
    expect(text).toMatch(/^(8|16|32)x(8|16|32) [a-z ]+, \d colors from [^,]+(, [a-z -]+)+$/i);
  });

  it('gives a different prompt on each further draw for the same date', () => {
    const texts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((draw) =>
      themePromptText(themePrompt('2026-11-25', draw)),
    );
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('rarely repeats a prompt over a year', () => {
    const year = dates('2027-01-01', 365).map((date) => themePromptText(themePrompt(date)));
    expect(new Set(year).size).toBeGreaterThanOrEqual(350);
  });

  it('never combines parts that break a requirement or conflict', () => {
    for (const prompt of SAMPLE) {
      const ids = partsOf(prompt).map((part) => part.id);
      expect(new Set(ids).size, themePromptText(prompt)).toBe(ids.length);
      for (const part of partsOf(prompt)) {
        const context = `${part.id} in ${themePromptText(prompt)}`;
        expect(prompt.size, context).toBeGreaterThanOrEqual(part.minSize ?? 0);
        expect(prompt.palette.colors, context).toBeGreaterThanOrEqual(part.minColors ?? 0);
        for (const conflict of part.conflicts ?? []) expect(ids, context).not.toContain(conflict);
      }
    }
  });

  it('never asks for what the spec rules out', () => {
    const has = (prompt: ThemePrompt, id: string) => partsOf(prompt).some((part) => part.id === id);
    for (const prompt of SAMPLE) {
      const text = themePromptText(prompt);
      if (has(prompt, 'dithering')) {
        expect(prompt.size, text).toBeGreaterThanOrEqual(16);
        expect(prompt.palette.colors, text).toBeGreaterThanOrEqual(4);
      }
      if (has(prompt, 'anti-aliasing')) expect(prompt.palette.colors, text).toBeGreaterThan(3);
      if (has(prompt, 'sword')) expect(prompt.size, text).toBeGreaterThanOrEqual(16);
      if (has(prompt, 'dragon')) expect(prompt.size, text).toBe(32);
      expect(text.match(/light from/g)?.length ?? 0, text).toBeLessThanOrEqual(1);
      expect(text.includes('side view') && text.includes('front view'), text).toBe(false);
    }
  });

  it('can reach every curated part', () => {
    const seen = new Set(SAMPLE.flatMap((prompt) => partsOf(prompt).map((part) => part.id)));
    const sizes = new Set(SAMPLE.map((prompt) => prompt.size));
    for (const part of [
      ...THEME_PROMPT_SUBJECTS,
      ...THEME_PROMPT_PALETTES,
      ...THEME_PROMPT_CONSTRAINTS,
    ]) {
      expect(seen, part.id).toContain(part.id);
    }
    expect([...sizes].sort((a, b) => a - b)).toEqual([...THEME_PROMPT_SIZES]);
  });

  it('only asks for as many colors as its Bundled Palette has', () => {
    for (const part of THEME_PROMPT_PALETTES) {
      const palette = BUNDLED_PALETTES.find((p) => p.id === part.paletteId);
      expect(palette, part.id).toBeDefined();
      expect(part.colors, part.id).toBeLessThanOrEqual(palette!.colors.length);
    }
  });

  it('refuses a date that is not on the calendar', () => {
    expect(() => themePrompt('2026-02-30')).toThrow(RangeError);
    expect(() => themePrompt('25/11/2026')).toThrow(RangeError);
  });
});
