import { expect, test, type Page } from '@playwright/test';

const JAR = [
  '.OOOOOO.',
  'OPRRRRDO',
  'ORRRRDDO',
  'ORRRDDDO',
  'OOOOOOOO',
  'OGGGGLGO',
  'OGGGGGGO',
  '.OOOOOO.',
];

const COLORS: Record<string, string> = {
  O: '#1a1a2e',
  P: '#ff8080',
  R: '#cc3333',
  D: '#881c1c',
  G: '#3366cc',
  L: '#88aaff',
};

async function pngOf(page: Page, rows: string[], colors: Record<string, string>) {
  const bytes = await page.evaluate(
    async ({ rows, colors }) => {
      const canvas = new OffscreenCanvas(rows[0]!.length, rows.length);
      const context = canvas.getContext('2d')!;
      rows.forEach((row, y) =>
        [...row].forEach((c, x) => {
          if (c === '.') return;
          context.fillStyle = colors[c]!;
          context.fillRect(x, y, 1, 1);
        }),
      );
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return [...new Uint8Array(await blob.arrayBuffer())];
    },
    { rows, colors },
  );
  return Buffer.from(bytes);
}

test('turn an uploaded sprite into a Personal Lesson, fix its Roles and play it', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('#/lessons');
  await page.getByRole('link', { name: 'Make a Personal Lesson' }).click();
  await expect(page.getByText('your own art or openly licensed')).toBeVisible();

  const sprite = page.getByLabel('Choose a sprite');
  const tooBig = Array.from({ length: 40 }, () => 'O'.repeat(40));
  await sprite.setInputFiles({
    name: 'big.png',
    mimeType: 'image/png',
    buffer: await pngOf(page, tooBig, COLORS),
  });
  await expect(page.getByRole('alert')).toHaveText(
    "big.png can't become a Lesson. This image is 40x40 pixels. A Personal Lesson can be up to 32x32.",
  );

  await sprite.setInputFiles({
    name: 'jar.png',
    mimeType: 'image/png',
    buffer: await pngOf(page, JAR, COLORS),
  });
  const review = page.getByRole('form', { name: 'Review Roles' });
  await expect(page.getByRole('alert')).toBeHidden();
  await expect(review.getByLabel('Role of #1a1a2e')).toHaveValue('outline');
  await expect(review.getByLabel('Role of #cc3333')).toHaveValue('base');
  await expect(review.getByLabel('Role of #881c1c')).toHaveValue('shadow');
  await expect(review.getByLabel('Role of #88aaff')).toHaveValue('highlight');
  await expect(review.getByLabel('Steps')).toHaveText(
    '5 Steps: Silhouette, Outline, Base colors, Shadow, Highlight',
  );

  await review.getByLabel('Role of #ff8080').selectOption('shadow');
  await review.getByLabel('Role of #88aaff').selectOption('shadow');
  await expect(review.getByLabel('Steps')).toHaveText(
    '4 Steps: Silhouette, Outline, Base colors, Shadow',
  );
  await expect(review.getByLabel('Title')).toHaveValue('jar');
  await review.getByLabel('Title').fill('Jar');
  await review.getByRole('button', { name: 'Save Personal Lesson' }).click();

  await expect(page).toHaveURL(/#\/lessons$/);
  await page.reload();
  const modes = page.getByRole('list', { name: 'Jar Modes' });
  await expect(modes.getByRole('link')).toHaveText(['Trace Jar', 'Hint Jar', 'Freehand Jar']);

  await page.getByRole('button', { name: 'Copy manifest of Jar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Manifest copied.' })).toBeVisible();
  const manifest = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(manifest).toMatchObject({
    id: 'jar',
    title: 'Jar',
    roles: { '#ff8080': 'shadow', '#88aaff': 'shadow', '#1a1a2e': 'outline' },
  });
  expect(Object.keys(manifest.explanations)).toEqual(['silhouette', 'outline', 'base', 'shadow']);

  await modes.getByRole('link', { name: 'Freehand Jar' }).click();
  await expect(page.getByRole('img', { name: 'Reference Sprite: Jar' })).toBeVisible();
  await page.goto('#/lessons');
  await modes.getByRole('link', { name: 'Trace Jar' }).click();
  await expect(page.getByRole('button', { name: '4. Shadow' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Step 1: Silhouette' })).toBeVisible();
  await expect(page.getByText('one flat color')).toBeVisible();
});
