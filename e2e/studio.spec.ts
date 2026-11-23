import { expect, test, type Locator } from '@playwright/test';

const STUDIO_SIZE = 16;

/** The RGBA color painted at the centre of drawing pixel (x, y). */
function pixelAt(canvas: Locator, x: number, y: number) {
  return canvas.evaluate(
    (c: HTMLCanvasElement, { px, py, size }) => {
      const scale = c.width / size;
      const data = c
        .getContext('2d')!
        .getImageData((px + 0.5) * scale, (py + 0.5) * scale, 1, 1).data;
      return Array.from(data);
    },
    { px: x, py: y, size: STUDIO_SIZE },
  );
}

/** Mouse position over the centre of drawing pixel (x, y). */
async function pixelPosition(canvas: Locator, x: number, y: number) {
  const box = (await canvas.boundingBox())!;
  const cell = box.width / STUDIO_SIZE;
  return { x: box.x + (x + 0.5) * cell, y: box.y + (y + 0.5) * cell };
}

test('draw and erase pixels in the Studio from a deep link', async ({ page }) => {
  await page.goto('#/studio');
  const canvas = page.getByRole('img', { name: /studio canvas/i });
  await expect(canvas).toBeVisible();
  const blank = await pixelAt(canvas, 3, 5);

  await page.getByRole('button', { name: 'Color #e94560' }).click();
  await page.getByRole('button', { name: 'Pencil' }).click();
  const at = await pixelPosition(canvas, 3, 5);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => pixelAt(canvas, 3, 5)).toEqual([0xe9, 0x45, 0x60, 255]);

  // Dragging paints a connected line.
  const from = await pixelPosition(canvas, 2, 9);
  const to = await pixelPosition(canvas, 9, 9);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 2 });
  await page.mouse.up();
  for (let x = 2; x <= 9; x++) {
    await expect.poll(() => pixelAt(canvas, x, 9)).toEqual([0xe9, 0x45, 0x60, 255]);
  }

  await page.getByRole('button', { name: 'Eraser' }).click();
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => pixelAt(canvas, 3, 5)).toEqual(blank);
});
