import { checkCalendarDate, type CalendarDate } from './calendar-date';
import { createDrawing, type Drawing } from './drawing';
import { BUNDLED_PALETTES, type BundledPalette } from './palettes';
import { seededRandom, type Random } from './seeded-random';

export interface PartRules {
  readonly minSize?: number;
  readonly minColors?: number;
  readonly conflicts?: readonly string[];
}

export interface Subject extends PartRules {
  readonly id: string;
  readonly name: string;
}

export interface PromptPalette extends PartRules {
  readonly id: string;
  readonly paletteId: string;
  readonly colors: number;
}

export type ConstraintCheck = 'dithering';

export interface Constraint extends PartRules {
  readonly id: string;
  readonly text: string;
  readonly check?: ConstraintCheck;
}

export interface ThemePrompt {
  readonly date: CalendarDate;
  readonly draw: number;
  readonly subject: Subject;
  readonly size: number;
  readonly palette: PromptPalette;
  readonly constraints: readonly Constraint[];
}

export const THEME_PROMPT_SIZES = [8, 16, 32] as const;

const anySize = (id: string, name: string): Subject => ({ id, name });
const atLeast =
  (minSize: number) =>
  (id: string, name: string): Subject => ({ id, name, minSize });

export const THEME_PROMPT_SUBJECTS: readonly Subject[] = [
  anySize('coin', 'coin'),
  anySize('heart', 'heart'),
  anySize('key', 'key'),
  anySize('gem', 'gem'),
  anySize('mushroom', 'mushroom'),
  anySize('apple', 'apple'),
  anySize('star', 'star'),
  anySize('skull', 'skull'),
  anySize('bomb', 'bomb'),
  anySize('carrot', 'carrot'),
  anySize('fish', 'fish'),
  anySize('ghost', 'ghost'),
  anySize('slime', 'slime'),
  anySize('flame', 'flame'),
  anySize('cherries', 'pair of cherries'),
  atLeast(16)('health-potion', 'health potion'),
  atLeast(16)('sword', 'sword'),
  atLeast(16)('shield', 'shield'),
  atLeast(16)('treasure-chest', 'treasure chest'),
  atLeast(16)('magic-wand', 'magic wand'),
  atLeast(16)('cat', 'cat'),
  atLeast(16)('frog', 'frog'),
  atLeast(16)('bat', 'bat'),
  atLeast(16)('cactus', 'cactus'),
  atLeast(16)('candle', 'candle'),
  atLeast(16)('crown', 'crown'),
  atLeast(16)('axe', 'axe'),
  atLeast(16)('owl', 'owl'),
  atLeast(16)('cupcake', 'cupcake'),
  atLeast(16)('robot', 'robot'),
  atLeast(32)('knight', 'knight'),
  atLeast(32)('wizard', 'wizard'),
  atLeast(32)('dragon', 'dragon'),
  atLeast(32)('castle-tower', 'castle tower'),
  atLeast(32)('hot-air-balloon', 'hot air balloon'),
  atLeast(32)('pine-tree', 'pine tree'),
];

const fromPalette = (paletteId: string, colors: number, rules: PartRules = {}): PromptPalette => ({
  id: `${paletteId}-${colors}`,
  paletteId,
  colors,
  ...rules,
});

export const THEME_PROMPT_PALETTES: readonly PromptPalette[] = [
  fromPalette('2bit-demichrome', 2),
  fromPalette('2bit-demichrome', 4),
  fromPalette('oil-6', 3),
  fromPalette('oil-6', 6, { minSize: 16 }),
  fromPalette('pico-8', 3),
  fromPalette('pico-8', 4),
  fromPalette('pico-8', 6, { minSize: 16 }),
  fromPalette('sweetie-16', 3),
  fromPalette('sweetie-16', 4),
  fromPalette('sweetie-16', 5),
  fromPalette('sweetie-16', 8, { minSize: 16 }),
  fromPalette('dawnbringer-16', 4),
  fromPalette('dawnbringer-16', 6, { minSize: 16 }),
  fromPalette('endesga-32', 4),
  fromPalette('endesga-32', 8, { minSize: 16 }),
];

const LIGHTS = ['light-top-left', 'light-top-right', 'light-above'];
const light = (id: string, text: string): Constraint => ({
  id,
  text,
  minColors: 3,
  conflicts: LIGHTS.filter((other) => other !== id),
});

export const THEME_PROMPT_CONSTRAINTS: readonly Constraint[] = [
  light('light-top-left', 'light from top-left'),
  light('light-top-right', 'light from top-right'),
  light('light-above', 'light from above'),
  { id: 'dithering', text: 'include dithering', minSize: 16, minColors: 4, check: 'dithering' },
  { id: 'anti-aliasing', text: 'anti-alias the outline', minSize: 16, minColors: 4 },
  { id: 'no-outline', text: 'no outline', conflicts: ['selective-outline', 'anti-aliasing'] },
  {
    id: 'selective-outline',
    text: 'selective outline',
    minSize: 16,
    minColors: 4,
    conflicts: ['no-outline'],
  },
  { id: 'side-view', text: 'side view', conflicts: ['front-view'] },
  { id: 'front-view', text: 'front view', conflicts: ['side-view'] },
];

function pick<T>(random: Random, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

function followsRules(prompt: ThemePrompt): boolean {
  const parts = [prompt.subject, prompt.palette, ...prompt.constraints];
  const ids = parts.map((part) => part.id);
  if (new Set(ids).size !== ids.length) return false;
  return parts.every(
    (part) =>
      prompt.size >= (part.minSize ?? 0) &&
      prompt.palette.colors >= (part.minColors ?? 0) &&
      !(part.conflicts ?? []).some((conflict) => ids.includes(conflict)),
  );
}

const MAX_SAMPLES = 1000;

function sample(date: CalendarDate, draw: number, taken: ReadonlySet<string>): ThemePrompt {
  const random = seededRandom(`theme-prompt/${date}/${draw}`);
  for (let i = 0; i < MAX_SAMPLES; i++) {
    const constraintCount = random() < 0.5 ? 1 : 2;
    const prompt: ThemePrompt = {
      date,
      draw,
      subject: pick(random, THEME_PROMPT_SUBJECTS),
      size: pick(random, THEME_PROMPT_SIZES),
      palette: pick(random, THEME_PROMPT_PALETTES),
      constraints: Array.from({ length: constraintCount }, () =>
        pick(random, THEME_PROMPT_CONSTRAINTS),
      ),
    };
    if (followsRules(prompt) && !taken.has(themePromptText(prompt))) return prompt;
  }
  throw new Error(`No valid Theme Prompt found for ${date}, draw ${draw}`);
}

export function themePrompt(date: CalendarDate, draw = 0): ThemePrompt {
  if (!Number.isInteger(draw) || draw < 0) {
    throw new RangeError(`A draw is a whole number from 0, not ${draw}`);
  }
  const day = checkCalendarDate(date);
  const taken = new Set<string>();
  let prompt = sample(day, 0, taken);
  for (let next = 1; next <= draw; next++) {
    taken.add(themePromptText(prompt));
    prompt = sample(day, next, taken);
  }
  return prompt;
}

export function promptBundledPalette(prompt: ThemePrompt): BundledPalette {
  const palette = BUNDLED_PALETTES.find((p) => p.id === prompt.palette.paletteId);
  if (!palette) throw new Error(`${prompt.palette.paletteId} is not a Bundled Palette`);
  return palette;
}

export function themePromptPaletteText(prompt: ThemePrompt): string {
  return `${prompt.palette.colors} colors from ${promptBundledPalette(prompt).name}`;
}

export function themePromptText(prompt: ThemePrompt): string {
  return [
    `${prompt.size}x${prompt.size} ${prompt.subject.name}`,
    themePromptPaletteText(prompt),
    ...prompt.constraints.map((constraint) => constraint.text),
  ].join(', ');
}

export function blankThemePromptDrawing(prompt: ThemePrompt): Drawing {
  return createDrawing({
    width: prompt.size,
    height: prompt.size,
    palette: promptBundledPalette(prompt).colors,
  });
}
