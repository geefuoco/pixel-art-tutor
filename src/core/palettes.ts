import type { Color } from './drawing';

export const STUDIO_PLACEHOLDER_PALETTE: readonly Color[] = [
  '#1b1b2f',
  '#ffffff',
  '#e94560',
  '#f9a826',
  '#ffe66d',
  '#4ecdc4',
  '#3a86ff',
  '#8d5a97',
];

export interface BundledPalette {
  readonly id: string;
  readonly name: string;
  readonly creator: string;
  readonly colors: readonly Color[];
}

export const BUNDLED_PALETTES: readonly BundledPalette[] = [
  {
    id: 'pico-8',
    name: 'PICO-8',
    creator: 'Lexaloffle Games',
    colors: [
      '#000000',
      '#1d2b53',
      '#7e2553',
      '#008751',
      '#ab5236',
      '#5f574f',
      '#c2c3c7',
      '#fff1e8',
      '#ff004d',
      '#ffa300',
      '#ffec27',
      '#00e436',
      '#29adff',
      '#83769c',
      '#ff77a8',
      '#ffccaa',
    ],
  },
  {
    id: 'sweetie-16',
    name: 'Sweetie 16',
    creator: 'GrafxKid',
    colors: [
      '#1a1c2c',
      '#5d275d',
      '#b13e53',
      '#ef7d57',
      '#ffcd75',
      '#a7f070',
      '#38b764',
      '#257179',
      '#29366f',
      '#3b5dc9',
      '#41a6f6',
      '#73eff7',
      '#f4f4f4',
      '#94b0c2',
      '#566c86',
      '#333c57',
    ],
  },
  {
    id: 'dawnbringer-16',
    name: 'DawnBringer 16',
    creator: 'DawnBringer',
    colors: [
      '#140c1c',
      '#442434',
      '#30346d',
      '#4e4a4e',
      '#854c30',
      '#346524',
      '#d04648',
      '#757161',
      '#597dce',
      '#d27d2c',
      '#8595a1',
      '#6daa2c',
      '#d2aa99',
      '#6dc2ca',
      '#dad45e',
      '#deeed6',
    ],
  },
  {
    id: 'endesga-32',
    name: 'Endesga 32',
    creator: 'ENDESGA',
    colors: [
      '#be4a2f',
      '#d77643',
      '#ead4aa',
      '#e4a672',
      '#b86f50',
      '#733e39',
      '#3e2731',
      '#a22633',
      '#e43b44',
      '#f77622',
      '#feae34',
      '#fee761',
      '#63c74d',
      '#3e8948',
      '#265c42',
      '#193c3e',
      '#124e89',
      '#0099db',
      '#2ce8f5',
      '#ffffff',
      '#c0cbdc',
      '#8b9bb4',
      '#5a6988',
      '#3a4466',
      '#262b44',
      '#181425',
      '#ff0044',
      '#68386c',
      '#b55088',
      '#f6757a',
      '#e8b796',
      '#c28569',
    ],
  },
  {
    id: 'oil-6',
    name: 'Oil 6',
    creator: 'GrafxKid',
    colors: ['#fbf5ef', '#f2d3ab', '#c69fa5', '#8b6d9c', '#494d7e', '#272744'],
  },
  {
    id: '2bit-demichrome',
    name: '2bit Demichrome',
    creator: 'Space Sandwich',
    colors: ['#211e20', '#555568', '#a0a08b', '#e9efec'],
  },
];

export interface CustomPalette {
  readonly id: string;
  readonly name: string;
  readonly colors: readonly Color[];
}

export const MAX_CUSTOM_PALETTE_COLORS = 32;

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function normalized(color: Color): Color {
  if (!HEX_COLOR.test(color)) throw new RangeError(`${color} is not a hex color like #ff8800`);
  return color.toLowerCase();
}

export function addPaletteColor(colors: readonly Color[], color: Color): readonly Color[] {
  const added = normalized(color);
  if (colors.includes(added)) return colors;
  if (colors.length >= MAX_CUSTOM_PALETTE_COLORS) {
    throw new RangeError(`A palette holds at most ${MAX_CUSTOM_PALETTE_COLORS} colors`);
  }
  return [...colors, added];
}

export function changePaletteColor(
  colors: readonly Color[],
  index: number,
  color: Color,
): readonly Color[] {
  const changed = normalized(color);
  if (colors.some((c, i) => c === changed && i !== index)) return colors;
  return colors.map((c, i) => (i === index ? changed : c));
}

export function removePaletteColor(colors: readonly Color[], index: number): readonly Color[] {
  return colors.length > 1 ? colors.filter((_, i) => i !== index) : colors;
}
