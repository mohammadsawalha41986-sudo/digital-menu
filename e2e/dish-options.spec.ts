import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/admin';

/**
 * Option groups are made once on the options page and chosen on each dish's
 * card. What the card saves is what the customer sees on the dish.
 */

// Its own dish: the discount specs change another one in parallel.
const DISH = 'APP-001';
const DISH_NAME_EN = 'Hummus';
const GROUP = 'اختيار تجريبي للطبق';

test.describe.configure({ mode: 'serial' });

async function businessHref(page: Page) {
  await page.goto('/admin/businesses');
  return page.locator('a[href="/m/SBH001"]').first().evaluate((link) =>
    link.closest('article')?.querySelector('a[href^="/admin/businesses/"]')?.getAttribute('href') ?? '',
  );
}

test('a group made on the options page is chosen on the dish card and reaches the customer', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await signIn(page);
  const href = await businessHref(page);
  const businessId = href.split('/').pop() ?? '';

  // Make the group on the options page, on no dish yet.
  await page.goto(`${href}/options`);
  await page.getByRole('button', { name: /مشروبات/ }).click();
  const editor = page.getByRole('region', { name: 'Group editor' });
  await editor.getByLabel('الاسم · Name (AR)').fill(GROUP);
  await editor.getByRole('button', { name: /Save/ }).click();
  await expect(page.locator(`[data-option-group="${GROUP}"]`)).toBeVisible();

  // Choose it on the dish card, save, and reload: the choice is still there.
  await page.goto(`/admin/build/${businessId}/builder`);
  await page.getByRole('button', { name: DISH_NAME_EN }).click();
  const card = page.locator('form[aria-label="Edit dish"]');
  await card.getByLabel(GROUP).check();
  await card.getByRole('button', { name: 'Save dish' }).click();
  await expect(card.getByRole('status').first()).toContainText('Dish saved');
  await page.reload();
  await page.getByRole('button', { name: DISH_NAME_EN }).click();
  await expect(page.locator('form[aria-label="Edit dish"]').getByLabel(GROUP)).toBeChecked();

  // The customer's dish sheet shows the group.
  await page.goto('/m/SBH001?lang=ar');
  const dish = page.locator(`#menu-items-container [data-item="${DISH}"]`).first();
  await dish.scrollIntoViewIfNeeded();
  await dish.getByRole('button').last().click();
  await expect(page.locator('[data-choice-group]').filter({ hasText: GROUP })).toHaveCount(1);

  // Clean up: untick it on the card, and delete the group.
  await page.goto(`/admin/build/${businessId}/builder`);
  await page.getByRole('button', { name: DISH_NAME_EN }).click();
  const off = page.locator('form[aria-label="Edit dish"]');
  await off.getByLabel(GROUP).uncheck();
  await off.getByRole('button', { name: 'Save dish' }).click();
  await expect(off.getByRole('status').first()).toContainText('Dish saved');
  await page.goto(`${href}/options`);
  await page.locator(`[data-option-group="${GROUP}"]`).getByRole('button', { name: /Delete/ }).click();
  await expect(page.locator(`[data-option-group="${GROUP}"]`)).toHaveCount(0);
});
