import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/admin';

async function designPage(page: Page) {
  await page.goto('/admin/businesses');
  const href = await page.locator('a[href="/m/DEM006"]').first().evaluate((link) =>
    link.closest('article')?.querySelector('a[href^="/admin/businesses/"]')?.getAttribute('href') ?? '',
  );
  await page.goto(`${href}/design`);
}

test('photo shape, text size and a light page reach the public menu', async ({ page }) => {
  await signIn(page);
  await designPage(page);

  await page.getByLabel('Photo shape').selectOption('square');
  await page.getByLabel('Text size').selectOption('lg');
  await page.locator('label.design__auto').first().getByRole('checkbox').uncheck();
  await page.locator('input[name="menuPage"]').fill('#faf7f2');
  await page.getByRole('button', { name: 'Save design' }).click();
  await expect(page.getByRole('status').first()).toContainText('Brand saved');

  await page.goto('/m/DEM006?lang=ar');
  const root = page.locator('.sf-root');
  await expect(root).toHaveAttribute('data-image-shape', 'square');
  await expect(root).toHaveAttribute('data-menu-tone', 'light');
  // Text on the light page is dark.
  const heading = await page.getByRole('heading', { level: 1 }).evaluate((el) => getComputedStyle(el).color);
  expect(heading).not.toMatch(/rgb\(25[0-5], 25[0-5], 25[0-5]\)/);

  // Restore, so the suite is re-runnable.
  await designPage(page);
  await page.getByLabel('Photo shape').selectOption('landscape');
  await page.getByLabel('Text size').selectOption('md');
  await page.locator('label.design__auto').first().getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Save design' }).click();
  await expect(page.getByRole('status').first()).toContainText('Brand saved');

  await page.goto('/m/DEM006?lang=ar');
  await expect(page.locator('.sf-root')).toHaveAttribute('data-menu-tone', 'dark');
});
