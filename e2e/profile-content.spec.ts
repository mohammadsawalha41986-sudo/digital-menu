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

test('a dish opens its detail sheet and closes again', async ({ page }) => {
  await page.goto('/m/DEM001?lang=en');

  const dish = page.locator('[data-item="MN-001"]');
  await dish.scrollIntoViewIfNeeded();
  await dish.getByRole('button').last().click();

  const sheet = page.getByRole('button', { name: /Add to Order/ });
  await expect(sheet).toBeVisible();
  await expect(page.getByText('Grilled chicken breast').last()).toBeVisible();

  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  await expect(sheet).toBeHidden();
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

  await expect(page.locator('a[data-event="contact_phone"]').first()).toHaveAttribute('href', /^tel:\+?\d+/);
  await expect(page.locator('a[data-event="contact_whatsapp"]').first()).toHaveAttribute(
    'href',
    /^https:\/\/wa\.me\/\d+/,
  );

  // DEM002 has no contact details at all: no dead buttons (master spec §44).
  await page.goto('/m/DEM002?lang=en');
  await expect(page.locator('a[data-event="contact_phone"]')).toHaveCount(0);
  await expect(page.locator('a[data-event="contact_whatsapp"]')).toHaveCount(0);
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
