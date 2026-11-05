import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/admin';

async function sectionsPage(page: Page) {
  await page.goto('/admin/businesses');
  const href = await page.locator('a[href="/m/DEM006"]').first().evaluate((link) =>
    link.closest('article')?.querySelector('a[href^="/admin/businesses/"]')?.getAttribute('href') ?? '',
  );
  await page.goto(`${href}/sections`);
}

test('each section of the menu takes the layout the restaurant chose for it', async ({ page }) => {
  await signIn(page);
  await sectionsPage(page);

  const rows = page.locator('[data-section-row]');
  await expect(rows).toHaveCount(2);
  const first = rows.first();
  // The layout dropdown (the section-type one sits beside it on the same row).
  const select = first.locator('select[name^="style:"]');
  await expect(select).toHaveValue('auto');

  // A two-dish section on auto sits in the same grid as every section: two-up on a phone.
  await page.goto('/m/DEM006?lang=ar');
  const sections = page.locator('#menu-items-container section[data-category]');
  const grid = sections.first().locator('[data-section-layout="grid"]');
  await expect(grid).toBeVisible();
  expect(await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(2);

  await sectionsPage(page);
  await select.selectOption('list');
  await page.getByRole('button', { name: /Save/ }).click();
  await expect(page.getByRole('status')).toContainText('Saved');
  // The choice stays on screen after saving.
  await expect(select).toHaveValue('list');

  await page.goto('/m/DEM006?lang=ar');
  await expect(sections.first().locator('[data-section-layout="list"]')).toBeVisible();
  // The next section keeps its own layout.
  await expect(sections.nth(1).locator('[data-section-layout="list"]')).toHaveCount(0);

  // Restore, so the suite is re-runnable.
  await sectionsPage(page);
  await select.selectOption('auto');
  await page.getByRole('button', { name: /Save/ }).click();
  await expect(page.getByRole('status')).toContainText('Saved');
});
