import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/admin';

/**
 * MENU STUDIO — the §41 QA list, driven through the real interface.
 *
 * Every assertion here goes through the admin UI and then checks the *public*
 * page, because the studio's claim is not "the form saved" but "the menu a
 * customer sees changed". The one thing it must never change is the menu's
 * content, which is asserted around every design switch.
 */

const RUN = Date.now().toString(36).slice(-6);

/** Everything a visitor reads. Design changes must never move it. */
async function menuContent(page: Page, publicId: string) {
  await page.goto(`/m/${publicId}?lang=ar`);

  return page.locator('[data-item]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      code: node.getAttribute('data-item'),
      text: node.textContent?.replace(/\s+/g, ' ').trim(),
    })),
  );
}

/**
 * Serial: the studio is a workspace, and the interesting assertions are about
 * one menu changing over time. Each test carries the ids forward rather than
 * hunting for the business by name in a list that grows with every run.
 */
test.describe.configure({ mode: 'serial' });

test.describe('the studio', () => {
  test.slow();

  let businessId = '';
  let publicId = '';

  test('changes how a menu looks without changing what it says', async ({ page }) => {
    await signIn(page);

    // Build a menu with real content through the ordinary admin path.
    await page.goto('/admin/businesses/new');
    await page.getByLabel('Name (Arabic)').fill('مطعم الاستوديو');
    await page.getByLabel('Name (English)').fill('Studio Restaurant');
    await page.getByLabel('Slug').fill(`studio-${RUN}`);
    await page.getByLabel('Status').selectOption('ACTIVE');
    await page.getByRole('button', { name: 'Create business' }).click();

    await expect(page.getByRole('heading', { name: 'Studio Restaurant' })).toBeVisible();
    businessId = page.url().split('/admin/businesses/')[1]?.split('/')[0] ?? '';
    publicId =
      (await page.getByRole('link', { name: /^\/m\/[0-9A-HJ-KM-NP-TV-Z]{6}$/ }).first().textContent())
        ?.trim()
        .replace('/m/', '') ?? '';

    await page.goto(`/admin/businesses/${businessId}/menus`);
    const menuForm = page.locator('.admin__panel').filter({ hasText: 'New menu' });
    await menuForm.getByLabel('Key').fill('main');
    await menuForm.getByLabel('Title (Arabic)').fill('المنيو');
    await menuForm.getByLabel('Title (English)').fill('Main');
    await menuForm.getByLabel('Status').selectOption('ACTIVE');
    await menuForm.getByRole('button', { name: 'Create menu' }).click();
    await expect(menuForm.getByRole('status')).toContainText('Menu created');

    await page.getByText('Add a category').click();
    const categoryForm = page.locator('details', { hasText: 'Add a category' });
    await categoryForm.getByLabel('Key').fill('mains');
    await categoryForm.getByLabel('Name (Arabic)').fill('الأطباق');
    await categoryForm.getByLabel('Name (English)').fill('Mains');
    await categoryForm.getByRole('button', { name: 'Add category' }).click();
    await expect(categoryForm.getByRole('status')).toContainText('Category created');

    const itemForm = page.locator('.admin__panel').filter({ hasText: 'Add or update an item' });
    await itemForm.getByLabel('Item code').fill('SD-001');
    await itemForm.getByLabel('Category').selectOption('mains');
    await itemForm.getByLabel('Name (Arabic)').fill('طبق الاستوديو');
    await itemForm.getByLabel('Name (English)').fill('Studio plate');
    await itemForm.getByLabel('Price (SAR)').fill('55');
    await itemForm.getByLabel('Calories').fill('540');
    await itemForm.getByRole('button', { name: 'Save item' }).click();
    await expect(itemForm.getByRole('status')).toContainText('Item created');

    await page.reload();
    await page.getByRole('button', { name: 'Publish' }).first().click();
    await expect(page.getByRole('status').first()).toContainText('Published version 1');

    const before = await menuContent(page, publicId);
    expect(before.length).toBeGreaterThan(0);

    // --- The studio itself -------------------------------------------------
    await page.goto(`/admin/businesses/${businessId}/studio`);
    await expect(page.getByRole('heading', { name: 'Menu Studio' })).toBeVisible();

    await page.getByRole('link', { name: 'Open in studio' }).first().click();
    await expect(page.getByRole('heading', { name: 'Main' })).toBeVisible();

    // The live preview is the real public page.
    const preview = page.frameLocator('iframe[title="Live menu preview"]');
    await expect(preview.locator('[data-item="SD-001"]')).toBeVisible();

    // Device preview switches width without leaving the page.
    await page.getByRole('button', { name: 'Desktop' }).click();
    await expect(page.locator('iframe[title="Live menu preview"]')).toHaveAttribute(
      'width',
      '1280',
    );

    const design = page.locator('form[aria-label="Design"]');
    await design.getByLabel('Theme').selectOption('dark-luxury');
    await design.getByLabel('Heading').selectOption('arabic-kufi');
    await design.getByLabel('Density').selectOption('airy');
    await design.getByRole('button', { name: 'Save design' }).click();
    await expect(design.getByRole('status')).toContainText('Design saved');

    // The public page now carries the theme…
    await page.goto(`/m/${publicId}?lang=ar`);
    const menuSection = page.locator('[data-menu-theme]').first();
    await expect(menuSection).toHaveAttribute('data-menu-theme', 'dark-luxury');
    await expect(menuSection).toHaveAttribute('data-density', 'airy');

    // …and says exactly what it said before.
    expect(await menuContent(page, publicId)).toEqual(before);
  });

  test('hiding prices removes them from the page, not just from view', async ({ page }) => {
    await signIn(page);
    await page.goto(`/m/${publicId}?lang=ar`);
    await expect(page.locator('[data-item="SD-001"] [data-price]')).toContainText('55');

    await page.goto(`/admin/businesses/${businessId}/studio`);
    await page.getByRole('link', { name: 'Open in studio' }).first().click();

    const design = page.locator('form[aria-label="Design"]');
    await design.getByLabel('Prices').uncheck();
    await design.getByRole('button', { name: 'Save design' }).click();
    await expect(design.getByRole('status')).toContainText('Design saved');

    await page.goto(`/m/${publicId}?lang=ar`);

    // Absent from the markup, not merely invisible.
    await expect(page.locator('[data-item="SD-001"] [data-price]')).toHaveCount(0);
    expect(await page.content()).not.toContain('55.00');

    // The calorie figure the business did enter is still there: only prices
    // were switched off.
    await expect(page.locator('[data-item="SD-001"] [data-calories]')).toBeVisible();

    // And putting it back restores the price.
    await page.goto(`/admin/businesses/${businessId}/studio`);
    await page.getByRole('link', { name: 'Open in studio' }).first().click();
    const designAgain = page.locator('form[aria-label="Design"]');
    await designAgain.getByLabel('Prices').check();
    await designAgain.getByRole('button', { name: 'Save design' }).click();
    await expect(designAgain.getByRole('status')).toContainText('Design saved');

    await page.goto(`/m/${publicId}?lang=ar`);
    await expect(page.locator('[data-item="SD-001"] [data-price]')).toContainText('55');
  });

  test('a bulk price rise applies to the selection and shows on the menu', async ({ page }) => {
    await signIn(page);
    await page.goto(`/admin/businesses/${businessId}/studio`);
    await page.getByRole('link', { name: 'Open in studio' }).first().click();

    const bulk = page.locator('.admin__panel').filter({ hasText: 'Bulk edit' });
    await bulk.getByLabel('Select Studio plate').check();
    await bulk.getByLabel('Change').selectOption('adjust-price');
    await bulk.getByLabel('Percentage').fill('10');
    await bulk.getByRole('button', { name: 'Apply to selected' }).click();

    await expect(bulk.getByRole('status')).toContainText('1 item changed');

    await page.goto(`/m/${publicId}?lang=ar`);
    await expect(page.locator('[data-item="SD-001"] [data-price]')).toContainText('60.50');
  });

  test('a modifier group saves and rejects one that can never be satisfied', async ({ page }) => {
    await signIn(page);
    await page.goto(`/admin/businesses/${businessId}/studio`);

    const panel = page.locator('.admin__panel').filter({ hasText: 'Modifiers and add-ons' });
    const form = panel.locator('form.admin__form');

    await form.getByLabel('Key', { exact: true }).fill('size');
    await form.getByLabel('Name (Arabic)', { exact: true }).fill('الحجم');
    await form.getByLabel('Name (English)', { exact: true }).fill('Size');
    await form.getByLabel('Minimum choices').fill('1');
    await form.getByLabel('Maximum choices').fill('1');

    await form.getByLabel('Option 1 key').fill('regular');
    await form.getByLabel('Option 1 Arabic name').fill('عادي');
    await form.getByLabel('Option 1 price change').fill('0');
    await form.getByLabel('Option 2 key').fill('large');
    await form.getByLabel('Option 2 Arabic name').fill('كبير');
    await form.getByLabel('Option 2 price change').fill('3');

    await form.getByRole('button', { name: 'Save group' }).click();
    await expect(form.getByRole('status')).toContainText('Modifier group saved');

    // It is listed as a real group, with the bounds and options it was given.
    await page.reload();
    const saved = page.locator('.studio__group').filter({ hasText: 'Size' });
    await expect(saved).toBeVisible();
    await expect(saved).toContainText('Required');
    await expect(saved).toContainText('كبير +3.00');

    // A group requiring three choices from one option cannot be satisfied.
    const second = page
      .locator('.admin__panel')
      .filter({ hasText: 'Modifiers and add-ons' })
      .locator('form.admin__form');

    await second.getByLabel('Key', { exact: true }).fill('impossible');
    await second.getByLabel('Name (Arabic)', { exact: true }).fill('مستحيل');
    await second.getByLabel('Minimum choices').fill('3');
    await second.getByLabel('Maximum choices').fill('1');
    await second.getByLabel('Option 1 key').fill('only');
    await second.getByLabel('Option 1 Arabic name').fill('واحد');
    await second.getByRole('button', { name: 'Save group' }).click();

    await expect(second.getByRole('alert')).toContainText('minimum cannot exceed');
  });

  test('the brand panel asks for a logo before claiming an identity', async ({ page }) => {
    await signIn(page);
    await page.goto(`/admin/businesses/${businessId}/studio`);
    const panel = page.locator('.admin__panel').filter({ hasText: 'Brand identity' });

    // This business has no media, so the panel says what is needed rather than
    // showing a palette it did not measure.
    await expect(panel).toContainText('Upload a logo to the media library first');
    await expect(panel.locator('.studio__palette')).toHaveCount(0);
  });
});
