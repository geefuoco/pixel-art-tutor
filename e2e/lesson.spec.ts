import { expect, test, type Locator, type Page } from '@playwright/test';

const SIZE = 8;

const RED_POTION = [
  '...ab...',
  '...cd...',
  '...cd...',
  '..cvvd..',
  '.ivcvyd.',
  '.ivvvyd.',
  '.iyyyyd.',
  '..dddd..',
];

const COLORS: Record<string, string> = {
  a: '#dba463',
  b: '#bb7547',
  c: '#e3e6ff',
  d: '#849be4',
  i: '#b9bffb',
  v: '#df3e23',
  y: '#b4202a',
};

const STEPS: { name: string; letters: string; color?: string }[] = [
  { name: 'Silhouette', letters: 'abcdivy', color: COLORS.v },
  { name: 'Outline', letters: 'di' },
  { name: 'Base colors', letters: 'av' },
  { name: 'Shadow', letters: 'by' },
  { name: 'Highlight', letters: 'c' },
];

function lessonCanvas(page: Page) {
  return page.getByRole('img', { name: /lesson canvas/i });
}

function pixelColor(canvas: Locator, x: number, y: number) {
  return canvas.evaluate(
    (c: HTMLCanvasElement, { x, y, size }) => {
      const [r, g, b] = c
        .getContext('2d')!
        .getImageData(((x + 0.5) * c.width) / size, ((y + 0.5) * c.height) / size, 1, 1).data;
      return '#' + [r, g, b].map((n) => n!.toString(16).padStart(2, '0')).join('');
    },
    { x, y, size: SIZE },
  );
}

async function drawStep(page: Page, letters: string, color?: string) {
  const canvas = lessonCanvas(page);
  const box = (await canvas.boundingBox())!;
  for (const letter of letters) {
    await page.getByRole('button', { name: `Color ${color ?? COLORS[letter]}` }).click();
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (RED_POTION[y]![x] !== letter) continue;
        await page.mouse.click(
          box.x + ((x + 0.5) * box.width) / SIZE,
          box.y + ((y + 0.5) * box.height) / SIZE,
        );
      }
    }
  }
}

test('complete a Trace Lesson step by step, resuming after a reload', async ({ page }) => {
  await page.goto('#/');
  await page.getByRole('link', { name: 'Start a Lesson' }).click();
  await page.getByRole('link', { name: 'Trace Red potion' }).click();
  await expect(lessonCanvas(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Step 1: Silhouette' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Silhouette in one flat color' })).toBeVisible();

  await drawStep(page, STEPS[0]!.letters, STEPS[0]!.color);
  await page.keyboard.press('c');
  await expect(page.getByRole('status')).toHaveText('Every silhouette pixel is right.');

  await page.getByRole('button', { name: 'Next Step' }).last().click();
  await expect(page.getByRole('heading', { name: 'Step 2: Outline' })).toBeVisible();
  await page.getByRole('button', { name: 'Check Step' }).last().click();
  await expect(page.getByRole('status')).toContainText('13 pixels missing, 0 extra');

  await drawStep(page, STEPS[1]!.letters);
  await page.getByRole('button', { name: 'Check Step' }).last().click();
  await expect(page.getByRole('status')).toHaveText('Every outline pixel is right.');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Step 1: Silhouette' })).toBeVisible();
  await page.getByRole('button', { name: '2. Outline' }).click();
  await page.getByRole('button', { name: 'Check Step' }).last().click();
  await expect(page.getByRole('status')).toHaveText('Every outline pixel is right.');

  for (const [i, step] of STEPS.entries()) {
    if (i < 2) continue;
    await page.keyboard.press(']');
    await expect(page.getByRole('heading', { name: `Step ${i + 1}: ${step.name}` })).toBeVisible();
    await drawStep(page, step.letters);
  }

  await page.getByRole('button', { name: 'Finish Lesson' }).click();
  const result = page.getByRole('region', { name: 'Result' });
  await expect(result).toContainText('Lesson passed');
  await expect(result).toContainText('100%');

  await page.reload();
  await expect(lessonCanvas(page)).toBeVisible();
  await expect.poll(() => pixelColor(lessonCanvas(page), 3, 3)).not.toBe(COLORS.v);

  await page.goto('#/lessons');
  await page.reload();
  const modes = page.getByRole('list', { name: 'Red potion Modes' });
  await expect(modes.getByRole('link', { name: 'Trace Red potion, passed' })).toBeVisible();
  await expect(modes.getByRole('link', { name: 'Hint Red potion' })).toBeVisible();
  await expect(modes.getByRole('link')).toHaveCount(2);
  await expect(modes).toContainText('Freehand locked');
});

test('Hint and Freehand stay locked until the Mode before them is passed', async ({ page }) => {
  await page.goto('#/lessons');
  const modes = page.getByRole('list', { name: 'Red potion Modes' });
  await expect(modes.getByRole('link')).toHaveText(['Trace Red potion']);
  await expect(modes).toContainText('Hint locked');
  await expect(modes).toContainText('Freehand locked');

  await page.goto('#/lessons/red-potion/hint');
  await expect(page.getByRole('heading', { name: 'Hint is locked' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText('Pass Red potion in Trace to unlock Hint.');
  await expect(lessonCanvas(page)).toBeHidden();
});
