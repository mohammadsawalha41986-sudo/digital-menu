import { expect, test } from '@playwright/test';
import { signIn } from './support/admin';

/**
 * THE GUIDED CREATION JOURNEY.
 *
 * A restaurant owner with no technical knowledge, from nothing to a published
 * menu behind a permanent QR:
 *
 *   name → logo → brand identity → menu → style → information → edit a dish →
 *   change a price → change the style → QR and link → publish → open the
 *   public URL and check it matches.
 *
 * Every step runs through the interface an owner actually sees. The last
 * assertions compare the public page against the preview, because "what you
 * see while building is what a customer gets" is the promise the whole flow
 * rests on.
 */

test.describe.configure({ mode: 'serial' });

const RUN = Date.now().toString(36).slice(-5);

/** A real PNG — the brand engine decodes it, so a fake blob would prove nothing. */
const LOGO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAvklEQVR4nOXOMQEAIAzAsFqYEWzgXxGTkYMjf5p73s/SAS0d0NIBLR3Q0gEtHdDSAS0d0NIBLR3Q0gEtHdDSAS0d0NIBLR3Q0gEtHdDSAS0d0NIBLR3Q0gEtHdDSAS0d0NIBLR3Q0gEtHdDSAS0d0NIBLR3Q0gEtHdDSAS0d0NIBLR3Q0gEtHdDSAS0d0NIBLR3Q0gEtHdDSAS0d0NIBLR3Q0gEtHdDSAS0d0NIBLR3Q0gEtHdDSAS0d0NIBbQF9PlFpseQysQAAAABJRU5ErkJggg==', 'base64');

test.describe('a new restaurant, start to finish', () => {
  test.slow();

  let businessId = '';
  let publicId = '';

  test('step 1: a name is all it takes to start', async ({ page }) => {
    await signIn(page);

    // The guided flow is the primary action, not something to go looking for.
    await page.getByRole('link', { name: 'Create digital menu' }).first().click();
    await expect(page.getByRole('heading', { name: /create your digital menu/i })).toBeVisible();

    // None of the database's vocabulary appears on the first screen.
    const form = (await page.locator('form.build__card').innerText()).toLowerCase();
    expect(form).not.toContain('slug');
    expect(form).not.toContain('public id');
    expect(form).not.toContain('template');

    await page.getByLabel('Restaurant name').fill(`Zaytoun ${RUN}`);
    await page.getByLabel('Arabic name').fill('مشاوي الزيتون');
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.waitForURL('**/build/**/brand');
    businessId = page.url().split('/build/')[1]?.split('/')[0] ?? '';
    expect(businessId).not.toBe('');
  });

  test('step 2: the logo becomes the brand, without asking for a colour', async ({ page }) => {
    await signIn(page);
    await page.goto(`/admin/build/${businessId}/brand`);

    await page.getByLabel('Logo image').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: LOGO,
    });
    await page.getByRole('button', { name: 'Upload logo' }).click();

    // Measured, not defaulted: a deep-green mark must produce a green brand.
    await expect(page.getByRole('status').first()).toContainText('Brand identity built from your logo');
    await expect(page.locator('.studio__palette li').first()).toBeVisible();

    const primary = await page
      .locator('.studio__palette li')
      .filter({ hasText: 'primary' })
      .locator('code')
      .textContent();

    expect(primary).not.toBe('#1F2421');
  });

  test('step 5: pasting a menu fills the live preview', async ({ page }) => {
    await signIn(page);
    await page.goto(`/admin/build/${businessId}/menu`);

    await page
      .getByLabel('Paste your menu')
      .fill(['Starters', 'Hummus | 18 | With olive oil', 'Fattoush | 22', '', 'Grills', 'Mixed grill | 85'].join('\n'));
    // Preview first: nothing is written until the owner adds.
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.locator('[data-paste-dish="new"]')).toHaveCount(3);
    await page.getByRole('button', { name: 'Add these items' }).click();

    await expect(page.getByRole('status').first()).toContainText('3 items added');

    const preview = page.frameLocator('iframe[title="Live preview"]');
    await expect(preview.locator('[data-item]').first()).toBeVisible();
  });

  test('step 3: the styles show this restaurant’s own menu', async ({ page }) => {
    await signIn(page);
    await page.goto(`/admin/build/${businessId}/style`);

    // A stock screenshot would tell an owner nothing about their own menu.
    const card = page.frameLocator('.build__style-frame iframe').first();
    await expect(card.locator('[data-item]').first()).toBeVisible();

    // And the card renders the menu alone — not the admin wrapped around it.
    await expect(card.locator('.admin__sidebar')).toHaveCount(0);

    await page.locator('.build__style').filter({ hasText: 'Large photos' }).click();
    await page.getByRole('button', { name: 'Save layout' }).click();
    await expect(page.getByRole('status').first()).toContainText('Photo layout saved');

    const preview = page.frameLocator('iframe[title="Live preview"]');
    await expect(preview.locator('[data-profile-root]')).toHaveAttribute('data-variant', 'c');
  });

  test('step 4: details are saved and nothing empty is invented', async ({ page }) => {
    await signIn(page);
    await page.goto(`/admin/build/${businessId}/details`);

    await page.getByLabel('About, in English').fill('Charcoal grills and mezze.');
    await page.getByLabel('Phone', { exact: true }).fill('+966 55 123 4567');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('status').first()).toContainText('Saved');
  });

  test('step 7: editing a dish updates the preview without leaving the page', async ({ page }) => {
    await signIn(page);
    await page.goto(`/admin/build/${businessId}/builder`);

    await page.getByRole('button', { name: /Hummus/ }).click();
    await expect(page.getByRole('heading', { name: 'Edit dish' })).toBeVisible();

    await page.getByLabel('Price (SAR)').fill('21');
    await page.getByRole('button', { name: 'Save dish' }).click();
    await expect(page.getByRole('status').first()).toContainText(/updated|saved/i);

    const preview = page.frameLocator('iframe[title="Live preview"]');
    await expect(preview.getByText('21').first()).toBeVisible();
  });

  test('step 7: sections are added in Arabic and English, renamed, reordered and removed', async ({ page }) => {
    await signIn(page);
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto(`/admin/build/${businessId}/builder`);

    // The section form sends names only. This used to fail with
    // "key: Invalid input: expected string, received undefined".
    await page.getByRole('button', { name: 'Add a section' }).click();
    await page.getByLabel('Section name, in Arabic').fill('دجاج الشواية');
    await page.getByLabel('Section name, in English').fill('Grilled chicken');
    await page.getByRole('button', { name: 'Add section' }).click();
    await expect(page.getByRole('status').first()).toContainText('Category created');
    await expect(page.locator('body')).not.toContainText('expected string');
    const section = page.locator('[data-builder-section="grilled-chicken"]');
    await expect(section).toContainText('دجاج الشواية');

    // An empty section to delete later.
    await page.getByLabel('Section name, in Arabic').fill('مؤقت');
    await page.getByRole('button', { name: 'Add section' }).click();
    await expect(page.locator('[data-builder-section]')).toHaveCount(4);

    // A dish in the new section, with a decimal price.
    await page.getByRole('button', { name: 'Add a dish' }).click();
    await page.getByLabel('Name, in Arabic', { exact: true }).fill('نصف دجاج شواية مع الأرز');
    await page.getByLabel('Price (SAR)').fill('23.50');
    await page.getByLabel('Section', { exact: true }).selectOption('grilled-chicken');
    await page.getByRole('button', { name: 'Add dish' }).click();
    await expect(page.locator('form[aria-label="Edit dish"]').getByRole('status')).toContainText('Dish added');
    await expect(section).toContainText('نصف دجاج شواية مع الأرز');
    await expect(section).toContainText('23.5 SAR');

    // Rename keeps the dish in place.
    await section.getByRole('button', { name: /Rename/ }).click();
    await section.getByLabel('Section name (AR)').fill('دجاج على الفحم');
    await section.getByRole('button', { name: /Save name/ }).click();
    await expect(section).toContainText('دجاج على الفحم');
    await expect(section).toContainText('نصف دجاج شواية مع الأرز');

    // Move it to the top.
    for (let index = 0; index < 2; index += 1) {
      await section.getByRole('button', { name: /Move up/ }).click();
      await page.waitForLoadState('networkidle');
    }
    await expect(page.locator('[data-builder-section]').first()).toHaveAttribute('data-builder-section', 'grilled-chicken');

    // A section with a dish cannot be deleted; an empty one can.
    await expect(section.getByRole('button', { name: /Delete section/ })).toBeDisabled();
    const temporary = page.locator('[data-builder-section]').filter({ hasText: 'مؤقت' });
    await temporary.getByRole('button', { name: /Delete section/ }).click();
    await expect(page.locator('[data-builder-section]')).toHaveCount(3);

    // Everything is still there after a reload.
    await page.reload();
    await expect(page.locator('[data-builder-section]').first()).toContainText('دجاج على الفحم');
    await expect(page.locator('[data-builder-section="grilled-chicken"]')).toContainText('23.5 SAR');
  });

  test('step 7: a dish is duplicated and deleted, and new dishes never overwrite old ones', async ({ page }) => {
    await signIn(page);
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto(`/admin/build/${businessId}/builder`);
    const dishes = page.locator('[data-builder-section] .build__item-button');
    const before = await dishes.count();

    await page.getByRole('button', { name: /Fattoush/ }).click();
    await page.getByRole('button', { name: /Duplicate/ }).click();
    await expect(page.locator('[aria-label="Dish tools"]').getByRole('status')).toContainText('Copied');
    await expect(dishes).toHaveCount(before + 1);

    await page.getByRole('button', { name: /Fattoush/ }).first().click();
    await page.getByRole('button', { name: /Delete dish/ }).click();
    await expect(dishes).toHaveCount(before);

    // Two new dishes in a row after a delete: both kept (the browser-made
    // code used to repeat here and the second save replaced the first).
    for (const name of ['أرز بخاري', 'أرز برياني']) {
      await page.getByRole('button', { name: 'Add a dish' }).click();
      await page.getByLabel('Name, in Arabic', { exact: true }).fill(name);
      await page.getByLabel('Price (SAR)').fill('8');
      await page.getByRole('button', { name: 'Add dish' }).click();
      await expect(page.locator('form[aria-label="Edit dish"]').getByRole('status')).toContainText('Dish added');
    }
    await expect(dishes).toHaveCount(before + 2);
    await expect(page.getByRole('button', { name: /أرز بخاري/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /أرز برياني/ })).toBeVisible();
  });

  test('step 7: a dish photo is uploaded, kept after a reload, reused from the library and removed', async ({ page }) => {
    await signIn(page);
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto(`/admin/build/${businessId}/builder`);

    await page.getByRole('button', { name: /Hummus/ }).click();
    const picker = page.getByRole('region', { name: 'Dish image' });
    await expect(picker).toBeVisible();
    await picker.getByLabel(/Upload photo/).setInputFiles({
      name: 'hummus-plate.png',
      mimeType: 'image/png',
      buffer: Buffer.from(LOGO),
    });
    await expect(picker.locator('[data-dish-photo-message]')).toContainText('Photo uploaded');
    await expect(picker.locator('[data-dish-photo-current]')).toBeVisible();

    // Still there after a reload.
    await page.reload();
    await page.getByRole('button', { name: /Hummus/ }).click();
    await expect(page.getByRole('region', { name: 'Dish image' }).locator('[data-dish-photo-current]')).toBeVisible();

    // The same stored photo on a second dish, picked from the library.
    await page.getByRole('button', { name: /Mixed grill/ }).click();
    const second = page.getByRole('region', { name: 'Dish image' });
    await second.getByRole('button', { name: /From library/ }).click();
    await second.getByPlaceholder(/Search by file or dish/).fill('Hummus');
    await second.locator('[data-library-photo]').first().click();
    await expect(second.locator('[data-dish-photo-message]')).toContainText('Photo set');
    await expect(second.locator('[data-dish-photo-current]')).toBeVisible();

    // Removing it from one dish leaves the other dish and the library alone.
    await second.getByRole('button', { name: /Remove/ }).click();
    await expect(second.locator('[data-dish-photo-current]')).toHaveCount(0);
    await page.getByRole('button', { name: /Hummus/ }).click();
    await expect(page.getByRole('region', { name: 'Dish image' }).locator('[data-dish-photo-current]')).toBeVisible();
  });

  test('step 8: the address exists before publishing, and never moves', async ({ page }) => {
    await signIn(page);
    await page.goto(`/admin/build/${businessId}/qr`);

    const link = (await page.locator('.build__url code').textContent())?.trim() ?? '';
    expect(link).toMatch(/\/m\/[0-9A-HJ-KM-NP-TV-Z]{6}$/);
    publicId = link.split('/m/')[1]!;

    await expect(page.locator('.build__qr-art svg')).toBeVisible();

    // Change the photo layout; the destination is byte-identical afterwards.
    await page.goto(`/admin/build/${businessId}/style`);
    await page.locator('.build__style').filter({ hasText: 'List' }).click();
    await page.getByRole('button', { name: 'Save layout' }).click();
    await expect(page.getByRole('status').first()).toContainText('Photo layout saved');

    await page.goto(`/admin/build/${businessId}/qr`);
    expect((await page.locator('.build__url code').textContent())?.trim()).toBe(link);
  });

  test('step 10: publishing makes the public URL answer, and it matches the preview', async ({ page }) => {
    await signIn(page);

    // Nothing is public until the owner says so.
    expect((await page.request.get(`/m/${publicId}`)).status()).toBe(404);

    await page.goto(`/admin/build/${businessId}/review`);
    await expect(page.getByText('Dishes', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Publish menu' }).click();
    await expect(page.getByRole('status').first()).toContainText('Published');

    await page.goto(`/admin/preview/${businessId}?lang=ar`);
    const previewItems = await page
      .locator('[data-item]')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent?.replace(/\s+/g, ' ').trim()));

    await page.goto(`/m/${publicId}?lang=ar`);
    const publicItems = await page
      .locator('[data-item]')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent?.replace(/\s+/g, ' ').trim()));

    // The promise of the whole flow: the preview was the real thing.
    expect(publicItems).toEqual(previewItems);
    expect(publicItems.join(' ')).toContain('21');
  });

  test('step 5 again: an Arabic menu pasted twice is added once, and bad lines are named', async ({ page }) => {
    await signIn(page);
    await page.goto(`/admin/build/${businessId}/menu`);
    const text = [
      'دجاج الشواية',
      'نصف دجاج شواية مع الأرز | 23 | نصف دجاج شواية مع أرز',
      'حبة دجاج شواية مع الأرز | 44 | حبة دجاج شواية مع أرز',
      'الأرز',
      'أرز بخاري | 8',
      'أرز برياني | 8',
      'أرز مندي |',
    ].join('\n');

    await page.goto(`/admin/build/${businessId}/builder`);
    const dishButtons = page.locator('[data-builder-section] .build__item-button');
    const before = await dishButtons.count();
    await page.goto(`/admin/build/${businessId}/menu`);

    await page.getByLabel('Paste your menu').fill(text);
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.locator('[data-paste-dish="new"]')).toHaveCount(4);
    await expect(page.locator('[data-paste-problem="7"]')).toContainText('No price');
    await expect(page.getByLabel('Paste your menu')).toHaveValue(text);
    await page.getByRole('button', { name: 'Add these items' }).click();
    await expect(page.getByRole('status').first()).toContainText('1 line not read');

    // The same text again: nothing new, nothing to add.
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.locator('[data-paste-dish="new"]')).toHaveCount(0);
    await expect(page.locator('[data-paste-dish="update"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add these items' })).toHaveCount(0);

    // Saved once: four dishes more than before, after a reload.
    await page.goto(`/admin/build/${businessId}/builder`);
    await expect(dishButtons).toHaveCount(before + 4);
    await expect(page.locator('[data-builder-section]').filter({ hasText: 'الأرز' }).first()).toContainText('أرز برياني');
  });

  test('an owner looking at their own preview is not counted as a customer', async ({ page }) => {
    await signIn(page);

    const views = page.locator('.admin__card').filter({ hasText: 'Profile views' });

    await page.goto(`/admin/businesses/${businessId}/analytics?range=today`);
    const before = (await views.locator('.admin__metric').textContent())?.trim();

    for (let visit = 0; visit < 3; visit += 1) {
      await page.goto(`/admin/preview/${businessId}`);
    }

    await page.goto(`/admin/businesses/${businessId}/analytics?range=today`);
    expect((await views.locator('.admin__metric').textContent())?.trim()).toBe(before);
  });
});
