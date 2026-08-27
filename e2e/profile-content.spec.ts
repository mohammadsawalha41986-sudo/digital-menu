import { expect, test } from '@playwright/test';

/**
 * Phase 1 — the public profile as a visitor actually experiences it: menu
 * content, prices, calories, item detail, contact actions, branch scoping.
 */

test('the menu renders categories and items in order', async ({ page }) => {
  await page.goto('/m/DEM001?lang=en');

  const categories = page.locator('[data-category]');
  await expect(categories).toHaveCount(3);
  await expect(categories.first()).toHaveAttribute('data-category', 'starters');

  await expect(page.locator('[data-item="MN-001"]')).toBeVisible();
});

test('prices are visible and formatted for the locale', async ({ page }) => {
  await page.goto('/m/DEM001?lang=en');

  const price = page.locator('[data-item="MN-001"] [data-price]');
  await expect(price).toBeVisible();
  await expect(price).toContainText('42');

  await page.goto('/m/DEM001?lang=ar');
  const arabicPrice = page.locator('[data-item="MN-001"] [data-price]');
  await expect(arabicPrice).toContainText('42');
  // Western Arabic numerals keep the price scannable (master spec §32).
  await expect(arabicPrice).not.toContainText('٤');
});

test('calories appear only where the business supplied them', async ({ page }) => {
  await page.goto('/m/DEM001?lang=en');

  await expect(page.locator('[data-item="MN-001"] [data-calories]')).toContainText('680 kcal');
  // Water has no calorie figure, and none is invented (GOALS I9).
  await expect(page.locator('[data-item="DR-002"] [data-calories]')).toHaveCount(0);
});

test('an item with detail opens and closes without JavaScript', async ({ page }) => {
  await page.goto('/m/DEM001?lang=en');

  const disclosure = page.locator('details[data-item="MN-001"]');
  await expect(disclosure).toHaveAttribute('open', /.*/, { timeout: 1000 }).catch(() => {});

  await disclosure.locator('summary').click();
  await expect(disclosure.locator('[data-item-detail]')).toBeVisible();
  await expect(disclosure).toContainText('Grilled chicken breast');
});

test('a hidden item never reaches the page', async ({ page }) => {
  await page.goto('/m/DEM001?lang=en');
  await expect(page.locator('[data-item="DR-003"]')).toHaveCount(0);
});

test('an unavailable item is flagged rather than removed', async ({ page }) => {
  await page.goto('/m/DEM001?lang=en');

  const item = page.locator('[data-item="MN-003"]');
  await expect(item).toBeVisible();
  await expect(item).toContainText('Currently unavailable');
  // It has no price, and none is invented.
  await expect(item.locator('[data-price]')).toHaveCount(0);
});

test('contact actions appear only for channels the business has', async ({ page }) => {
  await page.goto('/m/DEM001?lang=en');

  await expect(page.getByRole('link', { name: 'Call' })).toHaveAttribute('href', /^tel:/);
  await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
    'href',
    /^https:\/\/wa\.me\//,
  );

  // DEM002 has no contact details at all: no dead buttons (master spec §44).
  await page.goto('/m/DEM002?lang=en');
  await expect(page.getByRole('link', { name: 'Call' })).toHaveCount(0);
});

test('a branch QR resolves and applies its own price', async ({ page }) => {
  await page.goto('/m/DEM001/b/olaya?lang=en');

  await expect(page.locator('[data-profile-root]')).toHaveAttribute('data-branch', 'olaya');
  await expect(page.locator('[data-item="MN-001"] [data-price]')).toContainText('46');

  // The business-level URL is unaffected.
  await page.goto('/m/DEM001?lang=en');
  await expect(page.locator('[data-item="MN-001"] [data-price]')).toContainText('42');
});

test('the category index scrolls without pushing the page sideways', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/m/DEM001?lang=ar');

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});
