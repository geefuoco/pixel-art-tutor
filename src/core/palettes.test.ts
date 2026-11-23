import { describe, expect, it } from 'vitest';
import {
  addPaletteColor,
  BUNDLED_PALETTES,
  changePaletteColor,
  MAX_CUSTOM_PALETTE_COLORS,
  removePaletteColor,
} from './palettes';

describe('bundled palettes', () => {
  it('offers 4 to 6 well-known palettes, each credited to its creator', () => {
    expect(BUNDLED_PALETTES.length).toBeGreaterThanOrEqual(4);
    expect(BUNDLED_PALETTES.length).toBeLessThanOrEqual(6);
    for (const palette of BUNDLED_PALETTES) {
      expect(palette.name).not.toBe('');
      expect(palette.creator).not.toBe('');
    }
    expect(new Set(BUNDLED_PALETTES.map((p) => p.id)).size).toBe(BUNDLED_PALETTES.length);
  });

  it('holds only distinct hex colors, no more than a custom palette may', () => {
    for (const { colors } of BUNDLED_PALETTES) {
      expect(colors.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
      expect(new Set(colors).size).toBe(colors.length);
      expect(colors.length).toBeLessThanOrEqual(32);
    }
  });

  it('includes PICO-8 with its 16 colors in their usual order', () => {
    const pico8 = BUNDLED_PALETTES.find((p) => p.name === 'PICO-8');
    expect(pico8?.creator).toBe('Lexaloffle Games');
    expect(pico8?.colors.slice(0, 4)).toEqual(['#000000', '#1d2b53', '#7e2553', '#008751']);
    expect(pico8?.colors).toHaveLength(16);
  });
});

describe('custom palette colors', () => {
  it('adds a color at the end, in lowercase', () => {
    expect(addPaletteColor(['#000000'], '#FFAA00')).toEqual(['#000000', '#ffaa00']);
  });

  it('ignores a color the palette already has', () => {
    expect(addPaletteColor(['#000000', '#ffaa00'], '#FFAA00')).toEqual(['#000000', '#ffaa00']);
  });

  it('holds at most 32 colors', () => {
    expect(MAX_CUSTOM_PALETTE_COLORS).toBe(32);
    const full = Array.from({ length: 32 }, (_, i) => `#0000${i.toString(16).padStart(2, '0')}`);
    expect(() => addPaletteColor(full, '#ffffff')).toThrow(RangeError);
  });

  it('rejects something that is not a hex color', () => {
    expect(() => addPaletteColor(['#000000'], 'red')).toThrow(RangeError);
    expect(() => changePaletteColor(['#000000'], 0, '#12345')).toThrow(RangeError);
  });

  it('changes a color in place, unless that would repeat another color', () => {
    const colors = ['#000000', '#ffffff', '#ff0000'];
    expect(changePaletteColor(colors, 1, '#00FF00')).toEqual(['#000000', '#00ff00', '#ff0000']);
    expect(changePaletteColor(colors, 1, '#ff0000')).toEqual(colors);
  });

  it('removes a color, but never the last one', () => {
    expect(removePaletteColor(['#000000', '#ffffff', '#ff0000'], 1)).toEqual([
      '#000000',
      '#ff0000',
    ]);
    expect(removePaletteColor(['#000000'], 0)).toEqual(['#000000']);
  });
});
