import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/admin';

/**
 * A discount set in the admin appears in the menu's automatic offers section
 * and on the dish itself, and leaves both when switched off. Nothing is
 * copied, published again, or added by hand.
 */

const DISH = 'SHW-003';
const DISH_NAME_EN = 'Shawarma Sarookh';

// The two tests change the same dish, so they run one after the other.
test.describe.configure({ mode: 'serial' });

async function discountsPage(page: Page) {
  await page.goto('/admin/businesses');
  const href = await page.locator('a[href="/m/SBH001"]').first().evaluate((link) =>
    link.closest('article')?.querySelector('a[href^="/admin/businesses/"]')?.getAttribute('href') ?? '',
  );
  await page.goto(`${href}/discounts?view=all`);
  return href;
}

test('a discount set in the admin appears in the offers section and on the dish, and leaves when switched off', async ({
  page,
}) => {
  await signIn(page);
  await discountsPage(page);

  // Tick the dish, set 20% off, apply.
  await page.locator(`input[name="itemCodes"][value="${DISH}"]`).check();
  await page.getByLabel('النسبة % · Percent').fill('20');
  await page.getByRole('button', { name: /Apply to 1/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved for 1 dish' })).toBeVisible();

  // The public menu: the dish is in the deals section, with the old price struck and the new one.
  await page.goto('/m/SBH001?lang=ar');
  const deals = page.locator('[data-deals-section]');
  await deals.scrollIntoViewIfNeeded();
  await expect(deals).toBeVisible();
  const inDeals = deals.locator(`[data-item="${DISH}"]`);
  await expect(inDeals.locator('[data-sale-badge="20"]')).toContainText('خصم 20%');
  await expect(inDeals.locator('[data-sale-was]')).toContainText('13.00');
  await expect(inDeals.locator('[data-price]')).toContainText('10.40');
  await expect(inDeals.locator('[data-sale-saving]')).toContainText('2.60');
  // The same dish stays in its own section, once more: no copy, no double discount.
  await expect(page.locator(`#menu-items-container > section:not([data-deals-section]) [data-item="${DISH}"]`)).toHaveCount(1);
  await expect(page.locator(`[data-item="${DISH}"] [data-price]`)).toHaveCount(2);
  await expect(page.locator(`[data-item="${DISH}"] [data-price]`).first()).toContainText('10.40');

  // Switch it off from the list: the dish leaves the offers section at once.
  await discountsPage(page);
  const row = page.locator(`[data-discount-row="${DISH}"]`);
  await row.getByRole('button', { name: /Turn off/ }).click();
  await expect(row.getByText('معطل · Off')).toBeVisible();

  await page.goto('/m/SBH001?lang=ar');
  await expect(page.locator('[data-deals-section]')).toHaveCount(0);
  await expect(page.locator(`[data-item="${DISH}"] [data-sale-badge]`)).toHaveCount(0);
  await expect(page.locator(`[data-item="${DISH}"] [data-price]`).first()).toContainText('13.00');

  // The dish is left switched off, as it was before the test.
  await discountsPage(page);
  await expect(page.locator(`[data-discount-row="${DISH}"]`).getByText('معطل · Off')).toBeVisible();
});

test('a discount set on the dish card itself saves with the dish, shows the final price, and reaches the offers section', async ({
  page,
}) => {
  await signIn(page);
  const href = await discountsPage(page);
  const businessId = href.split('/').pop() ?? '';

  await page.goto(`/admin/build/${businessId}/builder`);
  await page.getByRole('button', { name: DISH_NAME_EN }).click();
  const card = page.locator('form[aria-label="Edit dish"]');
  await expect(card.getByRole('heading', { name: 'Edit dish' })).toBeVisible();

  // Enter the final price the customer should pay: the card works out the percentage.
  await card.getByLabel('تفعيل خصم · Enable discount').check();
  await card.getByLabel('نوع الخصم · Type').selectOption('PRICE');
  await card.getByLabel(/السعر بعد الخصم/).fill('10.40');
  await expect(card.locator('[data-discount-preview="1040"]')).toContainText('20%');
  await card.getByRole('button', { name: 'Save dish' }).click();
  await expect(card.getByRole('status').first()).toContainText('Dish saved');

  // The discount is on the dish's own record, and the offers section shows it.
  await page.goto('/m/SBH001?lang=ar');
  await expect(page.locator(`[data-deals-section] [data-item="${DISH}"] [data-price]`)).toContainText('10.40');

  // Switch it off from the same card: the offers section lets it go.
  await page.goto(`/admin/build/${businessId}/builder`);
  await page.getByRole('button', { name: DISH_NAME_EN }).click();
  const off = page.locator('form[aria-label="Edit dish"]');
  await off.getByLabel('تفعيل خصم · Enable discount').uncheck();
  await off.getByRole('button', { name: 'Save dish' }).click();
  await expect(off.getByRole('status').first()).toContainText('Dish saved');
  await page.goto('/m/SBH001?lang=ar');
  await expect(page.locator('[data-deals-section]')).toHaveCount(0);
});
