import { expect, test, type Locator, type Page } from '@playwright/test';
import { backupWithPassedTraces } from './backup';

function promptCanvas(page: Page) {
  return page.getByRole('img', { name: /daily prompt canvas/i });
}

function promptHeading(page: Page) {
  return page.getByRole('heading', { level: 1 });
}

async function canvasSize(page: Page): Promise<number> {
  const [, size] = /^(\d+)x\1 /.exec((await promptHeading(page).textContent()) ?? '') ?? [];
  return Number(size);
}

function pixelAt(canvas: Locator, size: number, x: number, y: number) {
  return canvas.evaluate(
    (c: HTMLCanvasElement, { px, py, size }) =>
      Array.from(
        c
          .getContext('2d')!
          .getImageData(((px + 0.5) * c.width) / size, ((py + 0.5) * c.height) / size, 1, 1).data,
      ),
    { px: x, py: y, size },
  );
}

async function clickPixel(page: Page, canvas: Locator, size: number, x: number, y: number) {
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(
    box.x + ((x + 0.5) * box.width) / size,
    box.y + ((y + 0.5) * box.height) / size,
  );
}

test("draw today's Theme Prompt, check it, keep it through a reload, save it and get another", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-11-25T10:00:00'));
  await page.goto('#/');
  await page.getByRole('link', { name: "Today's Daily Prompt" }).click();
  await expect(page.getByRole('link', { name: 'Daily Prompt', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByText(/Daily Prompt for November 25, 2026/)).toBeVisible();
  const canvas = promptCanvas(page);
  await expect(canvas).toBeVisible();
  const size = await canvasSize(page);
  const firstPrompt = await promptHeading(page).textContent();
  const blank = await pixelAt(canvas, size, 2, 2);

  await page.getByRole('button', { name: 'Pencil' }).click();
  await clickPixel(page, canvas, size, 2, 2);
  await expect.poll(() => pixelAt(canvas, size, 2, 2)).not.toEqual(blank);
  const drawn = await pixelAt(canvas, size, 2, 2);

  await page.getByRole('button', { name: 'Check drawing' }).click();
  const checks = page.getByRole('region', { name: 'The prompt' });
  await expect(
    checks.getByRole('listitem').filter({ hasText: `${size}x${size} canvas` }),
  ).toHaveText(/^Met/);
  await expect(checks.getByRole('listitem').filter({ hasText: /colors from/ })).toHaveText(/^Met/);
  await expect(page.getByRole('region', { name: 'Mistakes' })).toContainText('Orphan pixel');

  await page.reload();
  await expect(promptHeading(page)).toHaveText(firstPrompt!);
  await expect.poll(() => pixelAt(promptCanvas(page), size, 2, 2)).toEqual(drawn);

  await page.getByRole('button', { name: 'Save to Gallery' }).click();
  await expect(page.getByRole('button', { name: 'Saved to the Gallery' })).toBeDisabled();
  await page.getByRole('link', { name: 'Gallery', exact: true }).first().click();
  await expect(
    page.getByRole('article', { name: /Daily Prompt, November 25, 2026/ }),
  ).toContainText(firstPrompt!);

  await page.getByRole('link', { name: 'Daily Prompt', exact: true }).click();
  await page.getByRole('button', { name: 'Give me another' }).click();
  await expect(promptHeading(page)).not.toHaveText(firstPrompt!);
  await expect(page.getByText(/, prompt 2$/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save to Gallery' })).toBeEnabled();
});

test('replay a passed Lesson one Mode harder as a Review Drill, then get a Theme Prompt', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-11-29T10:00:00'));
  await page.goto('#/settings');
  await page.getByLabel('Backup file').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backupWithPassedTraces(['red-potion'], '2026-10-01T12:00:00')),
  });
  await page
    .getByRole('form', { name: 'Restore backup' })
    .getByRole('button', { name: 'Replace my drawings' })
    .click();
  await expect(page.getByRole('status')).toContainText('Restored');

  await page.getByRole('link', { name: 'Daily Prompt', exact: true }).click();
  await expect(page.getByText(/Daily Prompt for November 29, 2026/)).toBeVisible();
  await expect(promptHeading(page)).toHaveText('Review Drill: Red potion in Hint');
  await page.getByRole('link', { name: 'Start the Review Drill' }).click();
  await expect(page).toHaveURL(/#\/lessons\/red-potion\/hint$/);
  await expect(page.getByRole('img', { name: /lesson canvas/i })).toBeVisible();

  await page.getByRole('link', { name: 'Daily Prompt', exact: true }).click();
  await page.getByRole('button', { name: 'Give me another' }).click();
  await expect(page.getByText(/, prompt 2$/)).toBeVisible();
  await expect(promptCanvas(page)).toBeVisible();
});

test('draw a Technique Drill once its Lesson is passed, check it and keep it in the Gallery', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-11-28T10:00:00'));
  await page.goto('#/settings');
  await page.getByLabel('Backup file').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backupWithPassedTraces(['red-potion'], '2026-10-01T12:00:00')),
  });
  await page
    .getByRole('form', { name: 'Restore backup' })
    .getByRole('button', { name: 'Replace my drawings' })
    .click();
  await expect(page.getByRole('status')).toContainText('Restored');

  await page.getByRole('link', { name: 'Daily Prompt', exact: true }).click();
  await expect(promptHeading(page)).toHaveText('Technique Drill: Outline a pearl');
  const canvas = promptCanvas(page);
  await expect(canvas).toHaveAccessibleName(/8 by 8 pixels/);
  const pearl = await pixelAt(canvas, 8, 3, 3);
  expect(pearl[3]).toBe(255);

  await page.getByRole('button', { name: 'Check drawing' }).click();
  const checks = page.getByRole('region', { name: 'The drill' });
  await expect(
    checks.getByRole('listitem').filter({ hasText: 'The outline goes all the way round' }),
  ).toHaveText(/^Not met/);

  await page.reload();
  await expect(promptHeading(page)).toHaveText('Technique Drill: Outline a pearl');
  await page.getByRole('button', { name: 'Save to Gallery' }).click();
  await expect(page.getByRole('button', { name: 'Saved to the Gallery' })).toBeDisabled();
  await page.getByRole('link', { name: 'Gallery', exact: true }).first().click();
  await expect(
    page.getByRole('article', { name: /Daily Prompt, November 28, 2026/ }),
  ).toContainText('Technique Drill: Outline a pearl');
});
