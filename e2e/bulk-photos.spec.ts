import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { signIn } from './support/admin';

async function imagesStep(page: Page) {
  await page.goto('/admin/businesses');
  const href = await page.locator('a[href="/m/DEM006"]').first().evaluate((link) =>
    link.closest('article')?.querySelector('a[href^="/admin/businesses/"]')?.getAttribute('href') ?? '',
  );
  await page.goto(`${href.replace('/admin/businesses/', '/admin/build/')}/images`);
}

/** A camera-sized JPEG: 3000×2000 of busy pixels, about 5MB. */
async function cameraPhoto() {
  const width = 3000;
  const height = 2000;
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i += 1) pixels[i] = (i * 7919) % 251;
  return sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
}

test('many photos at once: matched by code and by Arabic name, made WebP, set on their dishes', async ({ page }) => {
  test.setTimeout(90_000);
  const big = await cameraPhoto();
  expect(big.byteLength).toBeGreaterThan(1_000_000);
  const small = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#c08040' } }).jpeg().toBuffer();
  const other = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#4080c0' } }).png().toBuffer();

  await signIn(page);
  await imagesStep(page);
  const bulk = page.locator('[data-bulk-photos]');
  await bulk.getByLabel(/Choose photos/).setInputFiles([
    { name: 'BK-001.jpg', mimeType: 'image/jpeg', buffer: big },
    { name: 'كرواسون زبده.jpg', mimeType: 'image/jpeg', buffer: small },
    { name: 'IMG_4032.png', mimeType: 'image/png', buffer: other },
  ]);

  await expect(bulk.locator('[data-bulk-summary]')).toContainText('3 صورة · 2 عُرف طبقها');
  await expect(bulk.locator('[data-bulk-row="BK-001.jpg"] select')).toHaveValue('BK-001');
  await expect(bulk.locator('[data-bulk-row="كرواسون زبده.jpg"] select')).toHaveValue('BK-010');
  await expect(bulk.locator('[data-bulk-row="IMG_4032.png"] select')).toHaveValue('');

  await bulk.getByRole('button', { name: /Upload/ }).click();
  await expect(bulk.locator('[data-status="done"]')).toHaveCount(3, { timeout: 60_000 });

  // The public menu shows both dishes with their new photos, served as WebP.
  await page.goto('/m/DEM006?lang=ar');
  for (const code of ['BK-001', 'BK-010']) {
    const img = page.locator(`#menu-items-container [data-item="${code}"] img`).first();
    await img.scrollIntoViewIfNeeded();
    const src = await img.getAttribute('src');
    const response = await page.request.get(src ?? '');
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toBe('image/webp');
  }
});
