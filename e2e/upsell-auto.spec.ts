import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/admin';

/**
 * A dish with no picks of its own is suggested dishes by its section's type,
 * and the restaurant can switch that off for the whole menu.
 */

const DISH = 'SHW-001';

test.describe.configure({ mode: 'serial' });

async function upsellPage(page: Page) {
  await page.goto('/admin/businesses');
  const href = await page.locator('a[href="/m/SBH001"]').first().evaluate((link) =>
    link.closest('article')?.querySelector('a[href^="/admin/businesses/"]')?.getAttribute('href') ?? '',
  );
  await page.goto(`${href}/upsell`);
}

async function openDish(page: Page) {
  await page.goto('/m/SBH001?lang=ar');
  const dish = page.locator(`#menu-items-container [data-item="${DISH}"]`).first();
  await dish.scrollIntoViewIfNeeded();
  await dish.getByRole('button').last().click();
}

test('a main dish with no picks suggests a drink, automatically', async ({ page }) => {
  await openDish(page);
  await expect(page.locator('[data-suggestion]').first()).toBeVisible();
  expect(await page.locator('[data-suggestion]').count()).toBeGreaterThan(0);
});

test('switching the automatic suggestions off removes them, and on brings them back', async ({ page }) => {
  await signIn(page);
  await upsellPage(page);
  const box = page.getByRole('checkbox', { name: /الاقتراحات التلقائية/ });
  await box.uncheck();
  await page.getByRole('form', { name: 'Automatic suggestions' }).getByRole('button', { name: /Save/ }).click();
  await expect(page.getByRole('form', { name: 'Automatic suggestions' }).getByRole('status')).toContainText('Saved');

  await openDish(page);
  await expect(page.locator('[data-suggestion]')).toHaveCount(0);

  await upsellPage(page);
  await page.getByRole('checkbox', { name: /الاقتراحات التلقائية/ }).check();
  await page.getByRole('form', { name: 'Automatic suggestions' }).getByRole('button', { name: /Save/ }).click();
  await expect(page.getByRole('form', { name: 'Automatic suggestions' }).getByRole('status')).toContainText('Saved');

  await openDish(page);
  await expect(page.locator('[data-suggestion]').first()).toBeVisible();
});
