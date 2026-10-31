import { expect, test } from '@playwright/test';

/**
 * The display-screen menu (`/m/{publicId}/screen`) — the menu as a TV board.
 */

test.use({ viewport: { width: 1920, height: 1080 } });

test('shows the restaurant’s dishes in 3D and turns on its own', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto('/m/SBH001/screen?lang=ar&seconds=3');

  const screen = page.locator('[data-menu-screen="SBH001"]');
  await expect(screen).toBeVisible();
  await expect(screen.getByRole('heading', { level: 1 })).toHaveText('مطعم صباح الليل');

  // The front dish carries a price; its neighbours stand at an angle in depth.
  const front = page.locator('.menu-screen__card[data-front]');
  await expect(front.locator('[data-price]')).toContainText('19.00');
  const first = await front.getAttribute('data-item');

  await expect
    .poll(async () =>
      page.locator('.menu-screen__card:not([data-front])').first().evaluate((card) => getComputedStyle(card).transform),
    )
    .toMatch(/^matrix3d\(/);

  // A customer can scan from the screen to the phone menu.
  await expect(page.locator('.menu-screen__qr img')).toBeVisible();

  // It advances by itself.
  await expect.poll(async () => front.getAttribute('data-item'), { timeout: 8000 }).not.toBe(first);

  expect(errors).toEqual([]);
});

test('can be pinned to one category', async ({ page }) => {
  await page.goto('/m/SBH001/screen?lang=ar');
  const category = await page.locator('.menu-screen__category').textContent();

  await page.goto('/m/SBH001/screen?lang=ar&category=shawarma');
  await expect(page.locator('.menu-screen__category')).not.toHaveText(category ?? '');
});

test('an unknown restaurant has no screen', async ({ page }) => {
  const response = await page.goto('/m/ZZZZZZ/screen');
  expect(response?.status()).toBe(404);
});
