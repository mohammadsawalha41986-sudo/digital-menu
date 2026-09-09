import { expect, test } from '@playwright/test';
import { createZip } from '../src/server/qr/zip';
import { signIn } from './support/admin';

/**
 * BULK ITEM PHOTOGRAPHY — the operator's whole path, in a browser.
 *
 * Spreadsheet import gives every dish a stable `item_id`; this is how the
 * photographs catch up with it. The assertions that matter are that the
 * preview is genuinely read-only, that the confirmation is bound to the
 * archive that was reviewed, and that an item the archive does not name keeps
 * the photograph it already had.
 */

const RUN = Date.now().toString(36).slice(-6);

/** Real PNG magic bytes; the media pipeline validates content, not extension. */
function png(marker: string): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(marker.padEnd(24, ' ')),
  ]);
}

test.describe.configure({ mode: 'serial' });

test.describe('bulk item photography from a ZIP', () => {
  test.slow();

  test('previews without writing, then assigns on confirmation', async ({ page }) => {
    await signIn(page);

    // A business with two dishes, one of which the archive will not name.
    await page.goto('/admin/businesses/new');
    await page.getByLabel('Name (Arabic)').fill('مطعم الصور');
    await page.getByLabel('Name (English)').fill('Photo Restaurant');
    await page.getByLabel('Slug').fill(`photos-${RUN}`);
    await page.getByLabel('Status').selectOption('ACTIVE');
    await page.getByRole('button', { name: 'Create business' }).click();
    await expect(page.getByRole('heading', { name: 'Photo Restaurant' })).toBeVisible();

    const businessId = page.url().split('/admin/businesses/')[1]?.split('/')[0] ?? '';
    expect(businessId).not.toBe('');

    await page.goto(`/admin/businesses/${businessId}/menus`);
    const menuForm = page.locator('.admin__panel').filter({ hasText: 'New menu' });
    await menuForm.getByLabel('Key').fill('main');
    await menuForm.getByLabel('Title (Arabic)').fill('المنيو');
    await menuForm.getByLabel('Status').selectOption('ACTIVE');
    await menuForm.getByRole('button', { name: 'Create menu' }).click();
    await expect(menuForm.getByRole('status')).toContainText('Menu created');

    await page.getByText('Add a category').click();
    const categoryForm = page.locator('details', { hasText: 'Add a category' });
    await categoryForm.getByLabel('Key').fill('mains');
    await categoryForm.getByLabel('Name (Arabic)').fill('الأطباق');
    await categoryForm.getByRole('button', { name: 'Add category' }).click();
    await expect(categoryForm.getByRole('status')).toContainText('Category created');

    for (const [code, name] of [['PH-001', 'طبق أول'], ['PH-002', 'طبق ثانٍ']]) {
      const itemForm = page.locator('.admin__panel').filter({ hasText: 'Add or update an item' });
      await itemForm.getByLabel('Item code').fill(code!);
      await itemForm.getByLabel('Category').selectOption('mains');
      await itemForm.getByLabel('Name (Arabic)').fill(name!);
      await itemForm.getByLabel('Price (SAR)').fill('40');
      await itemForm.getByRole('button', { name: 'Save item' }).click();
      await expect(itemForm.getByRole('status')).toContainText('Item created');
    }

    // The archive names one real dish, and two codes this business does not have.
    const archive = Buffer.from(
      createZip([
        { name: 'PH-001.png', content: png('first dish') },
        { name: 'NOPE-1.png', content: png('no such item') },
        { name: 'notes.txt', content: 'ignored, not an image' },
      ]),
    );

    await page.goto(`/admin/businesses/${businessId}/data`);
    const panel = page.locator('[data-image-zip-import]');
    await expect(panel).toContainText('item_id');

    await panel.locator('#image-zip-preview').setInputFiles({
      name: 'photos.zip',
      mimeType: 'application/zip',
      buffer: archive,
    });
    await panel.getByRole('button', { name: 'Preview image matches' }).click();

    const preview = page.locator('[data-image-zip-preview]');
    await expect(preview).toBeVisible();

    // Matched, unmatched and the effect on each row, before anything is stored.
    await expect(preview.getByRole('table')).toContainText('PH-001');
    await expect(preview.getByRole('table')).toContainText('Adds a first photo');
    await expect(preview).toContainText('Unmatched filenames (1)');
    await expect(preview).toContainText('NOPE-1');
    // The non-image is not offered for import at all.
    await expect(preview.getByRole('table')).not.toContainText('notes.txt');

    // Read-only really means read-only: the dish still has no photograph.
    await page.goto(`/admin/businesses/${businessId}/media`);
    await expect(page.locator('.admin__panel').first()).not.toContainText('PH-001.png');

    // A different archive cannot be confirmed against this preview.
    await page.goto(`/admin/businesses/${businessId}/data`);
    await panel.locator('#image-zip-preview').setInputFiles({
      name: 'photos.zip',
      mimeType: 'application/zip',
      buffer: archive,
    });
    await panel.getByRole('button', { name: 'Preview image matches' }).click();
    await expect(preview).toBeVisible();

    const tampered = Buffer.from(
      createZip([{ name: 'PH-001.png', content: png('a different image entirely') }]),
    );
    await preview.locator('#image-zip-confirm').setInputFiles({
      name: 'photos.zip',
      mimeType: 'application/zip',
      buffer: tampered,
    });
    await preview.getByRole('button', { name: /^Assign \d+ images$/ }).click();
    await expect(preview.getByRole('alert')).toContainText('different from the one you previewed');

    // The reviewed archive is accepted, and the report says what it did.
    await preview.locator('#image-zip-confirm').setInputFiles({
      name: 'photos.zip',
      mimeType: 'application/zip',
      buffer: archive,
    });
    await preview.getByRole('button', { name: /^Assign \d+ images$/ }).click();

    const done = preview.getByRole('status');
    await expect(done).toContainText('1 new');
    await expect(done).toContainText('0 replaced');
    await expect(done).toContainText('1 skipped');
    await expect(done).toContainText('0 failed');
    await expect(done).toContainText('QR is unchanged');

    // The studio is where an operator sees which dishes still lack a photo:
    // the named dish now has one, the dish the archive never mentioned does not.
    await page.goto(`/admin/businesses/${businessId}/studio`);
    await page.getByRole('link', { name: 'Open in studio' }).first().click();

    const withPhoto = page.locator('.studio__item').filter({ hasText: 'طبق أول' });
    const withoutPhoto = page.locator('.studio__item').filter({ hasText: 'طبق ثانٍ' });
    await expect(withPhoto).not.toContainText('no photo');
    await expect(withoutPhoto).toContainText('no photo');
  });
});
