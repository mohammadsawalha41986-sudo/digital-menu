import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/admin';

// Every test here saves the whole design form of the same restaurant; run in
// parallel, one test's save writes over another's half-way through.
test.describe.configure({ mode: 'serial' });

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

test('sections follow the chosen order, and motion settings reach the menu', async ({ page }) => {
  await signIn(page);
  await designPage(page);

  // Offers out of the menu, then moved to the top.
  const offersInside = page.getByLabel(/Show offers inside the menu/);
  await offersInside.uncheck();
  for (let i = 0; i < 2; i += 1) {
    await page.getByRole('button', { name: /العروض · Offers — للأعلى/ }).click();
  }
  await page.getByLabel('Hero motion').selectOption('story');
  await page.getByLabel('Dish photo effect').selectOption('float');
  await page.getByLabel('Background style').selectOption('gradient');
  await page.getByRole('button', { name: 'Save design' }).click();
  await expect(page.getByRole('status').first()).toContainText('Brand saved');

  await page.goto('/m/DEM006?lang=ar');
  const root = page.locator('.sf-root');
  await expect(root).toHaveAttribute('data-dish-effect', 'float');
  await expect(root).toHaveAttribute('data-background', 'gradient');
  await expect(page.locator('[data-hero-effect]')).toHaveAttribute('data-hero-effect', 'story');

  // Restore, so the suite is re-runnable.
  await designPage(page);
  for (let i = 0; i < 2; i += 1) {
    await page.getByRole('button', { name: /العروض · Offers — للأسفل/ }).click();
  }
  await page.getByLabel(/Show offers inside the menu/).check();
  await page.getByLabel('Hero motion').selectOption('slide');
  await page.getByLabel('Dish photo effect').selectOption('zoom');
  await page.getByLabel('Background style').selectOption('solid');
  await page.getByRole('button', { name: 'Save design' }).click();
  await expect(page.getByRole('status').first()).toContainText('Brand saved');
});

test('a restaurant with offers can put them above the menu', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/businesses');
  const href = await page.locator('a[href="/m/DEM001"]').first().evaluate((link) =>
    link.closest('article')?.querySelector('a[href^="/admin/businesses/"]')?.getAttribute('href') ?? '',
  );
  await page.goto(`${href}/design`);
  await page.getByLabel(/Show offers inside the menu/).uncheck();
  // menu, offers → offers, menu
  await page.getByRole('button', { name: /العروض · Offers — للأعلى/ }).click();
  await page.getByRole('button', { name: 'Save design' }).click();
  await expect(page.getByRole('status').first()).toContainText('Brand saved');

  await page.goto('/m/DEM001?lang=ar');
  const order = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#hero, [data-offers-strip], #menu-section')).map((el) => el.id || 'offers'),
  );
  expect(order).toEqual(['hero', 'offers', 'menu-section']);

  await page.goto(`${href}/design`);
  await page.getByRole('button', { name: /العروض · Offers — للأسفل/ }).click();
  await page.getByLabel(/Show offers inside the menu/).check();
  await page.getByRole('button', { name: 'Save design' }).click();
  await expect(page.getByRole('status').first()).toContainText('Brand saved');
});

test('after saving, the form keeps what was chosen, and saving again does not undo it', async ({ page }) => {
  await signIn(page);
  await designPage(page);

  await page.locator('[data-theme-key="cream"]').click();
  await page.getByLabel('Dish photo effect').selectOption('shine');
  await page.getByLabel('Background style').selectOption('aurora');
  await page.getByRole('button', { name: 'Save design' }).click();
  await expect(page.getByRole('status').first()).toContainText('Brand saved');

  // Without a reload, the form still shows the new settings…
  await expect(page.getByLabel('Dish photo effect')).toHaveValue('shine');
  await expect(page.getByLabel('Background style')).toHaveValue('aurora');
  await expect(page.locator('[data-theme-key="cream"]')).toHaveAttribute('aria-checked', 'true');

  // …so a second save keeps them rather than writing the old ones back.
  await page.getByRole('button', { name: 'Save design' }).click();
  await expect(page.getByRole('status').first()).toContainText('Brand saved');
  await page.reload();
  await expect(page.getByLabel('Dish photo effect')).toHaveValue('shine');

  // The cream template turns the menu light.
  await page.goto('/m/DEM006?lang=ar');
  await expect(page.locator('.sf-root')).toHaveAttribute('data-menu-tone', 'light');

  // Restore.
  await designPage(page);
  await page.locator('[data-theme-key="auto"]').click();
  await page.getByLabel('Dish photo effect').selectOption('zoom');
  await page.getByLabel('Background style').selectOption('solid');
  await page.getByRole('button', { name: 'Save design' }).click();
  await expect(page.getByRole('status').first()).toContainText('Brand saved');
});
