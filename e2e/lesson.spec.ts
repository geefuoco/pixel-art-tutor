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

function guideShownAt(page: Page, x: number, y: number) {
  return page
    .locator('.pixel-marks')
    .evaluate(
      (c: HTMLCanvasElement, { x, y, size }) =>
        c
          .getContext('2d')!
          .getImageData(((x + 0.5) * c.width) / size, ((y + 0.5) * c.height) / size, 1, 1)
          .data[3]! > 0,
      { x, y, size: SIZE },
    );
}

async function drawEveryStep(page: Page) {
  for (const [i, step] of STEPS.entries()) {
    await page.getByRole('button', { name: `${i + 1}. ${step.name}` }).click();
    await drawStep(page, step.letters, step.color);
  }
}

test('play Hint with no persistent Guide, flashing it with "show me"', async ({ page }) => {
  await page.goto('#/lessons/red-potion/trace');
  await drawEveryStep(page);
  await page.getByRole('button', { name: 'Finish Lesson' }).click();
  await expect(page.getByRole('region', { name: 'Result' })).toContainText('Lesson passed');

  await page.goto('#/lessons');
  await page.getByRole('link', { name: 'Hint Red potion' }).click();
  await expect(page.getByRole('heading', { name: 'Step 1: Silhouette' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Silhouette in one flat color' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Palette' }).getByRole('button')).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Guide', exact: true })).toHaveCount(0);

  await expect(lessonCanvas(page)).toBeVisible();
  await page.waitForTimeout(500);
  expect(await guideShownAt(page, 3, 3)).toBe(false);

  await page.keyboard.press('h');
  await expect.poll(() => guideShownAt(page, 3, 3)).toBe(true);
  await expect.poll(() => guideShownAt(page, 3, 3), { timeout: 3000 }).toBe(false);

  await page.getByRole('button', { name: 'Show me' }).first().click();
  await expect.poll(() => guideShownAt(page, 3, 3)).toBe(true);

  await drawEveryStep(page);
  await page.getByRole('button', { name: '1. Silhouette' }).click();
  await page.keyboard.press('c');
  await expect(page.getByRole('status')).toHaveText('Every silhouette pixel is right.');

  await page.getByRole('button', { name: '5. Highlight' }).click();
  await page.getByRole('button', { name: 'Finish Lesson' }).click();
  const result = page.getByRole('region', { name: 'Result' });
  await expect(result).toContainText('Lesson passed');
  await expect(result).toContainText('100%');
  await expect(result).toContainText('You used Show me 2 times.');

  await page.goto('#/lessons');
  const modes = page.getByRole('list', { name: 'Red potion Modes' });
  await expect(modes.getByRole('link', { name: 'Hint Red potion, passed' })).toBeVisible();
  await expect(modes.getByRole('link', { name: 'Freehand Red potion' })).toBeVisible();
});

test('keep passed Attempts, chosen Attempts and Studio drawings in the Gallery', async ({
  page,
}) => {
  await page.goto('#/lessons/red-potion/trace');
  await drawEveryStep(page);
  await page.getByRole('button', { name: 'Finish Lesson' }).click();
  const result = page.getByRole('region', { name: 'Result' });
  await expect(result).toContainText('Lesson passed');
  await expect(result).toContainText('Saved to the Gallery.');

  await result.getByRole('button', { name: 'Start over' }).click();
  await page.getByRole('button', { name: '5. Highlight' }).click();
  await page.getByRole('button', { name: 'Finish Lesson' }).click();
  await expect(result).toContainText('Not passed yet');
  await result.getByRole('button', { name: 'Save to Gallery' }).click();
  await expect(result).toContainText('Saved to the Gallery.');

  await page.goto('#/studio');
  const studioCanvas = page.getByRole('img', { name: /studio canvas/i });
  const box = (await studioCanvas.boundingBox())!;
  await page.getByRole('button', { name: 'Color #e94560' }).click();
  await page.mouse.click(box.x + box.width / 32, box.y + box.height / 32);

  await page.getByRole('link', { name: 'Gallery' }).click();
  const entries = page.getByRole('main').getByRole('article');
  await expect(entries).toHaveCount(3);
  await expect(entries.nth(0)).toContainText('Studio drawing');
  await expect(entries.nth(1)).toContainText('Red potion');
  await expect(entries.nth(1)).toContainText('Trace, 0%');
  await expect(entries.nth(2)).toContainText('Trace, 100%');

  await entries.nth(2).getByRole('link', { name: 'All Attempts at Red potion' }).click();
  await expect(page.getByRole('heading', { name: 'Red potion Attempts' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Attempt 1' })).toContainText('100%, passed');
  await expect(page.getByRole('article', { name: 'Attempt 2' })).toContainText('0%, not passed');

  await page.getByRole('link', { name: 'Back to the Gallery' }).click();
  await entries.nth(0).getByRole('button', { name: 'Open in Studio' }).click();
  await expect(studioCanvas).toBeVisible();
  await expect(page).toHaveURL(/#\/studio$/);
});

async function drawPotionOn(page: Page, size: number, offset: number) {
  const canvas = lessonCanvas(page);
  const box = (await canvas.boundingBox())!;
  for (const letter of 'abcdivy') {
    await page.getByRole('button', { name: `Color ${COLORS[letter]}` }).click();
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (RED_POTION[y]![x] !== letter) continue;
        await page.mouse.click(
          box.x + ((x + offset + 0.5) * box.width) / size,
          box.y + ((y + offset + 0.5) * box.height) / size,
        );
      }
    }
  }
}

test('play Freehand from the Reference Sprite on a bigger canvas, kept in the Gallery', async ({
  page,
}) => {
  for (const mode of ['trace', 'hint']) {
    await page.goto(`#/lessons/red-potion/${mode}`);
    await drawEveryStep(page);
    await page.getByRole('button', { name: 'Finish Lesson' }).click();
    await expect(page.getByRole('region', { name: 'Result' })).toContainText('Lesson passed');
  }

  await page.goto('#/lessons');
  await page.getByRole('link', { name: 'Freehand Red potion' }).click();
  await expect(page.getByRole('img', { name: 'Reference Sprite: Red potion' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Step/ })).toHaveCount(0);
  await expect(lessonCanvas(page)).toHaveAccessibleName(/8 by 8/);

  await page.getByLabel('Canvas size').selectOption('16');
  await expect(lessonCanvas(page)).toHaveAccessibleName(/16 by 16/);
  await drawPotionOn(page, 16, 7);

  await page.getByRole('button', { name: 'Finish Lesson' }).click();
  const result = page.getByRole('region', { name: 'Result' });
  await expect(result).toContainText('Lesson passed');
  await expect(result).toContainText('Your overall score is 100%.');
  const subScores = result.getByRole('definition');
  await expect(subScores).toHaveText(['100%', '100%', '100%']);
  await expect(result).toContainText('Saved to the Gallery.');

  await page.goto('#/gallery');
  await expect(page.getByRole('article').first()).toContainText(
    'Freehand, 100%, Shape 100%, Palette 100%, Line quality 100%',
  );
});
