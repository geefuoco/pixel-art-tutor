import { expect, test } from '@playwright/test';

test.describe('on a window narrower than 500px', () => {
  test.use({ viewport: { width: 420, height: 800 } });

  test('shows the mobile notice, and continuing anyway is remembered', async ({ page }) => {
    await page.goto('#/studio');
    const notice = page.getByRole('main', { name: 'Not supported on mobile' });
    await expect(notice).toBeVisible();
    await expect(page.getByRole('img', { name: /studio canvas/i })).toBeHidden();

    await notice.getByRole('button', { name: 'Continue anyway' }).click();
    await expect(page.getByRole('img', { name: /studio canvas/i })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('img', { name: /studio canvas/i })).toBeVisible();
    await expect(notice).toBeHidden();
  });
});

test.describe('on a touch-only device', () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });

  test('shows the mobile notice even on a wide screen', async ({ page }) => {
    await page.goto('#/');
    await expect(page.getByRole('main', { name: 'Not supported on mobile' })).toBeVisible();
  });
});

test('a desktop window of 500px or wider gets no notice', async ({ page }) => {
  await page.setViewportSize({ width: 500, height: 800 });
  await page.goto('#/');
  await expect(page.getByRole('heading', { name: 'Learn pixel art by drawing it' })).toBeVisible();
  await expect(page.getByRole('main', { name: 'Not supported on mobile' })).toBeHidden();
});
