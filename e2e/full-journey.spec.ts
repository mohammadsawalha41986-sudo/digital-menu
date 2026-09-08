import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/admin';

/**
 * THE MANDATORY END-TO-END JOURNEY (master spec §138).
 *
 * Create business → set brand → select template → create menu → add category
 * → add item with price and calories → publish → generate QR → open the QR
 * destination → switch language → verify RTL/LTR → change the price → change
 * the template → open the SAME QR → verify the new price → verify the profile
 * still resolves → verify analytics recorded the visit.
 *
 * Every step is driven through the real admin UI and the real public route.
 * Nothing is stubbed and nothing is asserted from fixture data.
 */

// Unique per run so the journey never collides with a previous one.
const RUN = Date.now().toString(36).slice(-6);
const SLUG = `journey-${RUN}`;

function panel(page: Page, heading: string) {
  return page.locator('.admin__panel').filter({ hasText: heading });
}

test('the full §138 journey, end to end', async ({ page }) => {
  test.slow();

  // ---- 1. Sign in --------------------------------------------------------
  await signIn(page);

  // ---- 2. Create the business -------------------------------------------
  await page.goto('/admin/businesses/new');

  await page.getByLabel('Name (Arabic)').fill('مطعم الرحلة');
  await page.getByLabel('Name (English)').fill('Journey Restaurant');
  await page.getByLabel('Slug').fill(SLUG);
  await page.getByLabel('Status').selectOption('ACTIVE');
  await page.getByRole('button', { name: 'Create business' }).click();

  // The redirect lands on the business page; capture its permanent public id.
  await expect(page.getByRole('heading', { name: 'Journey Restaurant' })).toBeVisible();

  const businessUrl = page.url();
  const businessId = businessUrl.split('/admin/businesses/')[1]?.split('/')[0] ?? '';
  expect(businessId).not.toBe('');

  const publicLink = page.getByRole('link', { name: /^\/m\/[0-9A-HJ-KM-NP-TV-Z]{6}$/ });
  const publicPath = (await publicLink.textContent())?.trim() ?? '';
  const publicId = publicPath.replace('/m/', '');

  // A public id, not a database id (§122).
  expect(publicId).toMatch(/^[0-9A-HJ-KM-NP-TV-Z]{6}$/);
  expect(publicId).not.toBe(businessId);

  // ---- 3. Brand ----------------------------------------------------------
  await page.goto(`/admin/businesses/${businessId}/brand`);
  await page.getByLabel('Primary').fill('#123456');
  await page.getByLabel('Accent').fill('#AA7722');
  await page.getByRole('button', { name: 'Save brand' }).click();
  await expect(page.getByRole('status')).toContainText('Brand saved');

  // ---- 4. Template -------------------------------------------------------
  await page.goto(`/admin/businesses/${businessId}/template`);
  await page.getByLabel('Template family').selectOption('editorial');
  await page.getByRole('button', { name: 'Apply template' }).click();
  await expect(page.getByRole('status')).toContainText('Template applied');

  // ---- 5. Menu, category, item ------------------------------------------
  await page.goto(`/admin/businesses/${businessId}/menus`);

  const menuForm = panel(page, 'New menu');
  await menuForm.getByLabel('Key').fill('main');
  await menuForm.getByLabel('Title (Arabic)').fill('المنيو الرئيسي');
  await menuForm.getByLabel('Title (English)').fill('Main Menu');
  await menuForm.getByLabel('Status').selectOption('ACTIVE');
  await menuForm.getByRole('button', { name: 'Create menu' }).click();
  await expect(menuForm.getByRole('status')).toContainText('Menu created');

  await page.getByText('Add a category').click();
  const categoryForm = page.locator('details', { hasText: 'Add a category' });
  await categoryForm.getByLabel('Key').fill('mains');
  await categoryForm.getByLabel('Name (Arabic)').fill('الأطباق الرئيسية');
  await categoryForm.getByLabel('Name (English)').fill('Main Courses');
  await categoryForm.getByRole('button', { name: 'Add category' }).click();
  await expect(categoryForm.getByRole('status')).toContainText('Category created');

  const itemForm = panel(page, 'Add or update an item');
  await itemForm.getByLabel('Item code').fill('JR-001');
  await itemForm.getByLabel('Category').selectOption('mains');
  await itemForm.getByLabel('Name (Arabic)').fill('برجر الرحلة');
  await itemForm.getByLabel('Name (English)').fill('Journey Burger');
  await itemForm.getByLabel('Price (SAR)').fill('38');
  await itemForm.getByLabel('Calories').fill('680');
  await itemForm.getByRole('button', { name: 'Save item' }).click();
  await expect(itemForm.getByRole('status')).toContainText('Item created');

  // ---- 6. Publish --------------------------------------------------------
  await page.reload();
  await page.getByRole('button', { name: 'Publish' }).first().click();
  await expect(page.getByRole('status').first()).toContainText('Published version 1');

  // ---- 7. QR -------------------------------------------------------------
  await page.goto(`/admin/businesses/${businessId}/qr`);

  const destination = (await page.locator('.admin__destination').first().textContent())?.trim();
  expect(destination).toContain(`/m/${publicId}`);
  // The QR encodes no file, no query, no locale (§10).
  expect(destination).not.toMatch(/\.(pdf|png|svg)$/);
  expect(destination).not.toContain('?');

  await expect(page.locator('.admin__qr-preview svg').first()).toBeVisible();
  await expect(page.getByText('Readability checks passed').first()).toBeVisible();

  const download = await page.request.get(
    `/admin/businesses/${businessId}/qr/download?artwork=plain&format=svg`,
  );
  expect(download.status()).toBe(200);
  expect(download.headers()['content-type']).toContain('image/svg+xml');

  // ---- 8. Open the QR destination ---------------------------------------
  await page.goto(`/m/${publicId}?lang=ar`);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('مطعم الرحلة');
  await expect(page.locator('[data-item="JR-001"] [data-price]')).toContainText('38');
  await expect(page.locator('[data-item="JR-001"] [data-calories]')).toContainText('680');

  // Brand tokens reached the page.
  await expect(page.locator('[data-profile-root]')).toHaveCSS(
    '--brand-color-primary',
    '#123456',
  );

  // ---- 9. Language and direction ----------------------------------------
  const root = page.locator('[data-profile-root]');
  await expect(root).toHaveCSS('direction', 'rtl');

  await page.getByRole('link', { name: 'English' }).click();
  await expect(root).toHaveCSS('direction', 'ltr');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Journey Restaurant');
  // The permanent path is unchanged by switching language.
  expect(new URL(page.url()).pathname).toBe(`/m/${publicId}`);

  // ---- 10. Change the price and the template ----------------------------
  await page.goto(`/admin/businesses/${businessId}/menus`);
  const editForm = panel(page, 'Add or update an item');
  await editForm.getByLabel('Item code').fill('JR-001');
  await editForm.getByLabel('Category').selectOption('mains');
  await editForm.getByLabel('Name (Arabic)').fill('برجر الرحلة');
  await editForm.getByLabel('Price (SAR)').fill('42');
  await editForm.getByLabel('Calories').fill('680');
  await editForm.getByRole('button', { name: 'Save item' }).click();
  await expect(editForm.getByRole('status')).toContainText('Item updated');

  await page.goto(`/admin/businesses/${businessId}/template`);
  await page.getByLabel('Template family').selectOption('bold');
  await page.getByRole('button', { name: 'Apply template' }).click();
  await expect(page.getByRole('status')).toContainText('Template applied');

  // ---- 11. The SAME QR still resolves, with the new content -------------
  await page.goto(`/admin/businesses/${businessId}/qr`);
  const destinationAfter = (
    await page.locator('.admin__destination').first().textContent()
  )?.trim();

  // The single most important assertion in the suite.
  expect(destinationAfter).toBe(destination);

  await page.goto(`/m/${publicId}?lang=en`);
  await expect(page.locator('[data-item="JR-001"] [data-price]')).toContainText('42');
  await expect(page.locator('[data-profile-root]')).toHaveAttribute('data-template', 'bold');

  // ---- 12. Price history recorded both values ---------------------------
  await page.goto('/admin');
  await expect(page.getByText('item.price_changed').first()).toBeVisible();

  // ---- 13. Analytics recorded the visits --------------------------------
  await page.goto(`/admin/businesses/${businessId}/analytics?range=today`);
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();

  const views = page.locator('.admin__card').filter({ hasText: 'Profile views' });
  await expect(views.locator('.admin__metric')).not.toHaveText('0');

  // ---- 14. Export carries the item, import-shaped ------------------------
  const exported = await page.request.get(
    `/admin/businesses/${businessId}/data/download?audience=admin&format=csv`,
  );
  expect(exported.status()).toBe(200);

  const csv = await exported.text();
  expect(csv).toContain('item_id');
  expect(csv).toContain('JR-001');
  expect(csv).toContain('42');
});
