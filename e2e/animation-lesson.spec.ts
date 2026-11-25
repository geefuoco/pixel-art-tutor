import { expect, test, type Page } from '@playwright/test';

const POTION = [
  '...ab...',
  '...cd...',
  '...cd...',
  '..cvvd..',
  '.ivcvyd.',
  '.ivvvyd.',
  '.iyyyyd.',
  '..dddd..',
];
const POTION_COLORS: Record<string, string> = {
  a: '#dba463',
  b: '#bb7547',
  c: '#e3e6ff',
  d: '#849be4',
  i: '#b9bffb',
  v: '#df3e23',
  y: '#b4202a',
};

const SQUASH = [
  '................',
  '................',
  '................',
  '................',
  '....abbaaaaa....',
  '...abaaaccccc...',
  '...aaaccccccc...',
  '..ccaaacaacccc..',
  '..cccdeccdeccc..',
  '.cccfegffegfccc.',
  '.cfffffffffffhc.',
  '.cfffffffffffhc.',
  '.fffffffffffhhh.',
  '..ffffffffhhhh..',
  '....hhfhhhhh....',
  '................',
];
const SLIME_COLORS: Record<string, string> = {
  a: '#63c74d',
  b: '#ffffff',
  c: '#3e8948',
  d: '#c0cbdc',
  e: '#262b44',
  f: '#265c42',
  g: '#181425',
  h: '#193c3e',
};

function lessonCanvas(page: Page) {
  return page.getByRole('img', { name: /lesson canvas/i });
}

async function drawGrid(page: Page, rows: string[], colors: Record<string, string>) {
  const size = rows.length;
  const box = (await lessonCanvas(page).boundingBox())!;
  for (const [letter, color] of Object.entries(colors)) {
    await page.getByRole('button', { name: `Color ${color}` }).click();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (rows[y]![x] !== letter) continue;
        await page.mouse.click(
          box.x + ((x + 0.5) * box.width) / size,
          box.y + ((y + 0.5) * box.height) / size,
        );
      }
    }
  }
}

test('trace an animation Lesson one Frame at a time, key poses first', async ({ page }) => {
  await page.goto('#/lessons/red-potion/trace');
  await drawGrid(page, POTION, POTION_COLORS);
  await page.getByRole('button', { name: '5. Highlight' }).click();
  await page.getByRole('button', { name: 'Finish Lesson' }).click();
  await expect(page.getByRole('region', { name: 'Result' })).toContainText('Lesson passed');

  await page.goto('#/lessons');
  await expect(page.getByRole('main')).toContainText('16x16, 8 colors, 4 Frames');
  await page.getByRole('link', { name: 'Trace Slime idle bob' }).click();

  const steps = page.getByRole('list', { name: 'Steps' }).getByRole('button');
  await expect(steps).toHaveText([
    '1. Frame 1, key pose',
    '2. Frame 3, key pose',
    '3. Frame 2, in-between',
    '4. Frame 4, in-between',
  ]);
  await expect(page.getByRole('heading', { name: 'Step 1: Frame 1, key pose' })).toBeVisible();
  await expect(lessonCanvas(page)).toHaveAccessibleName(/Frame 1 of 4/);
  await expect(page.getByRole('region', { name: 'Frames' })).toBeVisible();

  await drawGrid(page, SQUASH, SLIME_COLORS);
  await page.keyboard.press('c');
  await expect(page.getByRole('status')).toHaveText('Every pixel of Frame 1 is right.');

  await page.keyboard.press(']');
  await expect(page.getByRole('heading', { name: 'Step 2: Frame 3, key pose' })).toBeVisible();
  await expect(lessonCanvas(page)).toHaveAccessibleName(/Frame 3 of 4/);
  await page.getByRole('button', { name: 'Check Step' }).last().click();
  await expect(page.getByRole('status')).toContainText(/\d+ pixels missing, 0 extra/);

  await page.getByRole('button', { name: 'Frame 2', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Step 3: Frame 2, in-between' })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '1. Frame 1, key pose' }).click();
  await page.keyboard.press('c');
  await expect(page.getByRole('status')).toHaveText('Every pixel of Frame 1 is right.');

  await page.getByRole('button', { name: '4. Frame 4, in-between' }).click();
  await page.getByRole('button', { name: 'Finish Lesson' }).click();
  const result = page.getByRole('region', { name: 'Result' });
  await expect(result).toContainText('Not passed yet');
});
