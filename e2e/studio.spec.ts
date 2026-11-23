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

/** The RGBA color painted at the centre of drawing pixel (x, y). */
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

/** Mouse position over the centre of drawing pixel (x, y). */
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

test('draw and erase pixels in the Studio from a deep link', async ({ page }) => {
  await page.goto('#/studio');
  const canvas = studioCanvas(page);
  await expect(canvas).toBeVisible();
  const blank = await pixelAt(canvas, 3, 5);
  const blankRow = await Promise.all([2, 3, 4, 5, 6, 7, 8, 9].map((x) => pixelAt(canvas, x, 9)));

  await page.getByRole('button', { name: 'Color #e94560' }).click();
  await page.getByRole('button', { name: 'Pencil' }).click();
  await clickPixel(page, canvas, 3, 5);
  await expect.poll(() => pixelAt(canvas, 3, 5)).toEqual(RED);

  // Dragging paints a connected line.
  const from = await pixelPosition(canvas, 2, 9);
  const to = await pixelPosition(canvas, 9, 9);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 2 });
  await page.mouse.up();
  for (let x = 2; x <= 9; x++) {
    await expect.poll(() => pixelAt(canvas, x, 9)).toEqual(RED);
  }

  // The whole drag undoes as one step, leaving the earlier dot.
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
  await page.goto('#/studio');
  const canvas = studioCanvas(page);
  const blank = await pixelAt(canvas, 0, 0);

  // A red dot, then a yellow fill of everything around it.
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

  // The eyedropper picks red back up and returns to the pencil.
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
  await page.goto('#/studio');
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

  // The far corner of a non-square drawing is drawable.
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

  // The mouse wheel zooms at the cursor: the pixel under it stays under it.
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
  await page.goto('#/studio');
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
  await page.goto('#/studio');
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

  // Select around the dot, then drag it by the inside of the selection.
  await page.keyboard.press('m');
  await dragPixels({ x: 0, y: 0 }, { x: 2, y: 2 });
  await dragPixels({ x: 1, y: 1 }, { x: 5, y: 1 });
  await expect.poll(() => pixelAt(canvas, 5, 1)).toEqual(RED);
  await expect.poll(() => pixelAt(canvas, 1, 1)).toEqual(blank.at11);

  // Paste lands over the selection; dragging it leaves the original behind.
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
