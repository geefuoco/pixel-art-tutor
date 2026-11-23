import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';

interface Point {
  x: number;
  y: number;
}

const STUDIO_SIZE = 16;
const RED = [0xe9, 0x45, 0x60, 255];
const YELLOW = [0xf9, 0xa8, 0x26, 255];

interface Size {
  width: number;
  height: number;
}
const DEFAULT: Size = { width: STUDIO_SIZE, height: STUDIO_SIZE };

function pixelAt(canvas: Locator, x: number, y: number, size = DEFAULT) {
  return canvas.evaluate(
    (c: HTMLCanvasElement, { px, py, size }) => {
      const data = c
        .getContext('2d')!
        .getImageData(
          ((px + 0.5) * c.width) / size.width,
          ((py + 0.5) * c.height) / size.height,
          1,
          1,
        ).data;
      return Array.from(data);
    },
    { px: x, py: y, size },
  );
}

async function pixelPosition(canvas: Locator, x: number, y: number, size = DEFAULT) {
  const box = (await canvas.boundingBox())!;
  return {
    x: box.x + ((x + 0.5) * box.width) / size.width,
    y: box.y + ((y + 0.5) * box.height) / size.height,
  };
}

async function clickPixel(page: Page, canvas: Locator, x: number, y: number) {
  const at = await pixelPosition(canvas, x, y);
  await page.mouse.click(at.x, at.y);
}

function studioCanvas(page: Page) {
  return page.getByRole('img', { name: /studio canvas/i });
}

async function openStudio(page: Page) {
  await page.goto('#/studio');
  await expect(studioCanvas(page)).toBeVisible();
}

test('draw and erase pixels in the Studio from a deep link', async ({ page }) => {
  await openStudio(page);
  const canvas = studioCanvas(page);
  const blank = await pixelAt(canvas, 3, 5);
  const blankRow = await Promise.all([2, 3, 4, 5, 6, 7, 8, 9].map((x) => pixelAt(canvas, x, 9)));

  await page.getByRole('button', { name: 'Color #e94560' }).click();
  await page.getByRole('button', { name: 'Pencil' }).click();
  await clickPixel(page, canvas, 3, 5);
  await expect.poll(() => pixelAt(canvas, 3, 5)).toEqual(RED);

  const from = await pixelPosition(canvas, 2, 9);
  const to = await pixelPosition(canvas, 9, 9);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 2 });
  await page.mouse.up();
  for (let x = 2; x <= 9; x++) {
    await expect.poll(() => pixelAt(canvas, x, 9)).toEqual(RED);
  }

  await page.getByRole('button', { name: 'Undo' }).click();
  for (let x = 2; x <= 9; x++) {
    await expect.poll(() => pixelAt(canvas, x, 9)).toEqual(blankRow[x - 2]);
  }
  await expect.poll(() => pixelAt(canvas, 3, 5)).toEqual(RED);

  await page.getByRole('button', { name: 'Eraser' }).click();
  await clickPixel(page, canvas, 3, 5);
  await expect.poll(() => pixelAt(canvas, 3, 5)).toEqual(blank);
});

test('fill, eyedropper, and undo/redo from the keyboard', async ({ page }) => {
  await openStudio(page);
  const canvas = studioCanvas(page);
  const blank = await pixelAt(canvas, 0, 0);

  await page.getByRole('button', { name: 'Color #e94560' }).click();
  await clickPixel(page, canvas, 4, 4);
  await page.getByRole('button', { name: 'Color #f9a826' }).click();
  await page.keyboard.press('f');
  await clickPixel(page, canvas, 0, 0);
  await expect.poll(() => pixelAt(canvas, 15, 15)).toEqual(YELLOW);
  await expect.poll(() => pixelAt(canvas, 4, 4)).toEqual(RED);

  await page.keyboard.press('Control+z');
  await expect.poll(() => pixelAt(canvas, 15, 15)).toEqual(blank);
  await expect.poll(() => pixelAt(canvas, 4, 4)).toEqual(RED);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => pixelAt(canvas, 15, 15)).toEqual(YELLOW);

  await page.keyboard.press('i');
  await clickPixel(page, canvas, 4, 4);
  await expect(page.getByRole('button', { name: 'Color #e94560' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Pencil' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await clickPixel(page, canvas, 0, 0);
  await expect.poll(() => pixelAt(canvas, 0, 0)).toEqual(RED);
});

test('new drawing of a chosen size, zoom, pan and pixel grid', async ({ page }) => {
  await openStudio(page);
  await page.keyboard.press('n');
  const form = page.getByRole('form', { name: 'New drawing' });
  await form.getByLabel('Width').fill('32');
  await form.getByLabel('Height').fill('8');
  await form.getByRole('button', { name: 'Create' }).click();

  const canvas = page.getByRole('img', { name: 'Studio canvas, 32 by 8 pixels' });
  await expect(canvas).toBeVisible();
  const size = { width: 32, height: 8 };
  const fit = (await canvas.boundingBox())!;
  expect(fit.width / fit.height).toBeCloseTo(4);

  await page.getByRole('button', { name: 'Color #e94560' }).click();
  const corner = await pixelPosition(canvas, 31, 7, size);
  await page.mouse.click(corner.x, corner.y);
  await expect.poll(() => pixelAt(canvas, 31, 7, size)).toEqual(RED);

  await page.keyboard.press('+');
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeCloseTo(fit.width * 2);

  const zoomed = (await canvas.boundingBox())!;
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await canvas.boundingBox())!.x).toBeCloseTo(zoomed.x + 32);

  await page.keyboard.press('0');
  await expect.poll(async () => (await canvas.boundingBox())!).toEqual(fit);

  await page.mouse.move(corner.x, corner.y);
  await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeCloseTo(fit.width * 2);
  const after = await pixelPosition(canvas, 31, 7, size);
  const halfCell = fit.width / size.width / 2;
  expect(Math.abs(after.x - corner.x)).toBeLessThan(halfCell);
  expect(Math.abs(after.y - corner.y)).toBeLessThan(halfCell);
  await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeCloseTo(fit.width);

  const grid = page.locator('.pixel-grid');
  await expect(grid).toBeHidden();
  await page.keyboard.press('g');
  await expect(grid).toBeVisible();
  await page.getByRole('button', { name: 'Pixel grid' }).click();
  await expect(grid).toBeHidden();
});

test('a new drawing cannot be larger than 64x64', async ({ page }) => {
  await openStudio(page);
  await page.getByRole('button', { name: 'New drawing' }).click();
  const form = page.getByRole('form', { name: 'New drawing' });
  await form.getByLabel('Width').fill('65');
  await form.getByRole('button', { name: 'Create' }).click();
  await expect(form).toBeVisible();
  await expect(studioCanvas(page)).toHaveAccessibleName('Studio canvas, 16 by 16 pixels');

  await form.getByLabel('Width').fill('64');
  await form.getByLabel('Height').fill('64');
  await form.getByRole('button', { name: 'Create' }).click();
  await expect(form).toBeHidden();
  await expect(studioCanvas(page)).toHaveAccessibleName('Studio canvas, 64 by 64 pixels');
});

test('select, move, copy and paste pixels, and draw with mirror symmetry', async ({ page }) => {
  await openStudio(page);
  const canvas = studioCanvas(page);
  await expect(canvas).toBeVisible();
  const blank = { at11: await pixelAt(canvas, 1, 1), at56: await pixelAt(canvas, 5, 6) };

  async function dragPixels(from: Point, to: Point) {
    const a = await pixelPosition(canvas, from.x, from.y);
    const b = await pixelPosition(canvas, to.x, to.y);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.up();
  }

  await page.getByRole('button', { name: 'Color #e94560' }).click();
  await clickPixel(page, canvas, 1, 1);

  await page.keyboard.press('m');
  await dragPixels({ x: 0, y: 0 }, { x: 2, y: 2 });
  await dragPixels({ x: 1, y: 1 }, { x: 5, y: 1 });
  await expect.poll(() => pixelAt(canvas, 5, 1)).toEqual(RED);
  await expect.poll(() => pixelAt(canvas, 1, 1)).toEqual(blank.at11);

  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await dragPixels({ x: 5, y: 1 }, { x: 5, y: 6 });
  await expect.poll(() => pixelAt(canvas, 5, 6)).toEqual(RED);
  await expect.poll(() => pixelAt(canvas, 5, 1)).toEqual(RED);
  await page.keyboard.press('Control+z');
  await expect.poll(() => pixelAt(canvas, 5, 6)).toEqual(blank.at56);

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Mirror symmetry' }).click();
  await page.keyboard.press('b');
  await clickPixel(page, canvas, 0, 10);
  await expect.poll(() => pixelAt(canvas, 15, 10)).toEqual(RED);
});

async function decodedPixels(page: Page, png: Buffer, points: Point[]) {
  return page.evaluate(
    async ({ bytes, points }) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
      const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      return {
        width: bitmap.width,
        height: bitmap.height,
        pixels: points.map(({ x, y }) => Array.from(context.getImageData(x, y, 1, 1).data)),
      };
    },
    { bytes: [...png], points },
  );
}

async function solidPng(page: Page, width: number, height: number) {
  const bytes = await page.evaluate(
    async ({ width, height }) => {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#336699';
      context.fillRect(0, 0, width, height);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return [...new Uint8Array(await blob.arrayBuffer())];
    },
    { width, height },
  );
  return Buffer.from(bytes);
}

test('export a PNG upscaled, then open it in the Studio', async ({ page }) => {
  await openStudio(page);
  const canvas = studioCanvas(page);
  await page.getByRole('button', { name: 'Color #e94560' }).click();
  await clickPixel(page, canvas, 3, 5);

  await page.keyboard.press('Control+Shift+e');
  const form = page.getByRole('form', { name: 'Export PNG' });
  await form.getByLabel('Scale').selectOption('4');
  await expect(form).toContainText('64x64');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    form.getByRole('button', { name: 'Export' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const png = await readFile((await download.path())!);
  const decoded = await decodedPixels(page, png, [
    { x: 12, y: 20 },
    { x: 15, y: 23 },
    { x: 16, y: 23 },
  ]);
  expect([decoded.width, decoded.height]).toEqual([64, 64]);
  expect(decoded.pixels).toEqual([RED, RED, [0, 0, 0, 0]]);

  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Control+o');
  await (await chooser).setFiles({ name: 'export.png', mimeType: 'image/png', buffer: png });
  const opened = page.getByRole('img', { name: 'Studio canvas, 64 by 64 pixels' });
  await expect(opened).toBeVisible();
  const size = { width: 64, height: 64 };
  await expect.poll(() => pixelAt(opened, 12, 20, size)).toEqual(RED);
  await expect(page.getByRole('group', { name: 'Palette' }).getByRole('button')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Color #e94560' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('opening a PNG larger than 64x64 explains why and keeps the drawing', async ({ page }) => {
  await openStudio(page);
  const tooBig = await solidPng(page, 65, 20);
  await page.getByRole('button', { name: 'Open PNG' }).click();
  await page.getByLabel('PNG file').setInputFiles({
    name: 'big.png',
    mimeType: 'image/png',
    buffer: tooBig,
  });
  await expect(page.getByRole('alert')).toContainText('65x20');
  await expect(page.getByRole('alert')).toContainText('64x64');
  await expect(studioCanvas(page)).toHaveAccessibleName('Studio canvas, 16 by 16 pixels');

  await page.getByLabel('PNG file').setInputFiles({
    name: 'fits.png',
    mimeType: 'image/png',
    buffer: await solidPng(page, 64, 20),
  });
  await expect(studioCanvas(page)).toHaveAccessibleName('Studio canvas, 64 by 20 pixels');
  await expect(page.getByRole('alert')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Color #336699' })).toBeVisible();
});

test('resume drawings after a reload, and reopen an earlier one', async ({ page }) => {
  await openStudio(page);
  await page.getByRole('button', { name: 'Color #e94560' }).click();
  await clickPixel(page, studioCanvas(page), 3, 5);

  await page.keyboard.press('n');
  const form = page.getByRole('form', { name: 'New drawing' });
  await form.getByLabel('Width').fill('8');
  await form.getByLabel('Height').fill('8');
  await form.getByRole('button', { name: 'Create' }).click();
  const small = page.getByRole('img', { name: 'Studio canvas, 8 by 8 pixels' });
  const size = { width: 8, height: 8 };
  const dot = await pixelPosition(small, 1, 6, size);
  await page.mouse.click(dot.x, dot.y);
  await expect.poll(() => pixelAt(small, 1, 6, size)).toEqual(RED);

  await page.reload();
  await expect(small).toBeVisible();
  await expect.poll(() => pixelAt(small, 1, 6, size)).toEqual(RED);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();

  await page.keyboard.press('d');
  const drawings = page.getByRole('region', { name: 'Drawings' });
  await expect(drawings.getByRole('button')).toHaveText([/8x8/, /16x16/, 'Close']);
  await drawings.getByRole('button', { name: /16x16/ }).click();
  await expect(drawings).toBeHidden();
  await expect(studioCanvas(page)).toHaveAccessibleName('Studio canvas, 16 by 16 pixels');
  await expect.poll(() => pixelAt(studioCanvas(page), 3, 5)).toEqual(RED);
});

test('says so when the browser will not store drawings, and still lets you draw', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      get() {
        throw new DOMException('Site data is blocked', 'SecurityError');
      },
    });
  });
  await openStudio(page);
  await expect(page.getByRole('alert')).toContainText('Warning: drawings will not be saved');
  await page.getByRole('button', { name: 'Color #e94560' }).click();
  await clickPixel(page, studioCanvas(page), 2, 2);
  await expect.poll(() => pixelAt(studioCanvas(page), 2, 2)).toEqual(RED);
});
