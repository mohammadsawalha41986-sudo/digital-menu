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

test('the suggestions are grouped by kind, and a tab shows only its own dishes', async ({ page }) => {
  await openDish(page);
  const tabs = page.getByRole('tab');
  await expect(tabs.first()).toBeVisible();
  const count = await tabs.count();
  expect(count).toBeGreaterThan(1);

  const shownIds = () => page.locator('[data-suggestion]').evaluateAll((items) => items.map((item) => item.getAttribute('data-suggestion')));
  const first = await shownIds();
  expect(first.length).toBeGreaterThan(0);

  // Another tab shows other dishes: the kinds do not overlap for these pairs.
  const key = await page.locator('[role="tab"][aria-selected="false"]').first().getAttribute('data-tab');
  const other = page.locator(`[role="tab"][data-tab="${key}"]`);
  await other.click();
  await expect(other).toHaveAttribute('aria-selected', 'true');
  const second = await shownIds();
  expect(second.length).toBeGreaterThan(0);
  expect(second.some((id) => first.includes(id))).toBe(false);

  // A tab is a comfortable touch target: at least 44 pixels tall.
  const box = await tabs.first().boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  // The keyboard moves between tabs; forward is left in Arabic.
  const before = await page.locator('[role="tab"][aria-selected="true"]').getAttribute('data-tab');
  await page.locator(`[role="tab"][data-tab="${before}"]`).focus();
  await page.keyboard.press('ArrowLeft');
  const after = await page.locator('[role="tab"][aria-selected="true"]').getAttribute('data-tab');
  expect(after).not.toBe(before);
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
