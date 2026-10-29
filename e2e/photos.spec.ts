import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/admin';

async function businessIdFor(page: Page, publicId: string): Promise<string> {
  await page.goto('/admin/businesses');
  const href = await page.locator(`a[href="/m/${publicId}"]`).first().evaluate((link) => {
    const card = link.closest('article');
    return card?.querySelector('a[href^="/admin/businesses/"]')?.getAttribute('href') ?? '';
  });
  return href.split('/admin/businesses/')[1]?.split('/')[0] ?? '';
}

test('an uploaded photo is stored as WebP and can be deleted from the photos step', async ({ page }) => {
  const file = path.join(os.tmpdir(), `e2e-photo-${Date.now()}.jpg`);
  await writeFile(
    file,
    await sharp({ create: { width: 1400, height: 1000, channels: 3, background: { r: 30, g: 140, b: 90 } } })
      .jpeg()
      .toBuffer(),
  );

  await signIn(page);
  const businessId = await businessIdFor(page, 'DEM001');
  await page.goto(`/admin/build/${businessId}/images`);

  const before = await page.locator('.photo-library__item').count();
  await page.getByLabel('Photo', { exact: true }).setInputFiles(file);
  await page.getByRole('button', { name: 'Upload photo' }).click();

  const newest = page.locator('.photo-library__item').first();
  await expect(page.locator('.photo-library__item')).toHaveCount(before + 1);
  await expect(newest.locator('.photo-library__facts')).toContainText('1400×1000');
  await expect(newest.locator('.photo-library__facts')).toContainText('WEBP');

  page.once('dialog', (dialog) => dialog.accept());
  await newest.getByRole('button', { name: /Delete/ }).click();
  await expect(page.locator('.photo-library__item')).toHaveCount(before);
});
