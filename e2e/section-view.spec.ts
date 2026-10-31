import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/admin';

/**
 * The restaurant can hide a section from the menu and show it again, and a
 * visitor can see one section as cards or as a list.
 */

// Both tests use the same section: the hide test must finish before the visitor test looks for it.
test.describe.configure({ mode: 'serial' });

const SECTION = 'المقبلات والسلطات';

async function sectionsPage(page: Page) {
  await page.goto('/admin/businesses');
  const href = await page.locator('a[href="/m/SBH001"]').first().evaluate((link) =>
    link.closest('article')?.querySelector('a[href^="/admin/businesses/"]')?.getAttribute('href') ?? '',
  );
  await page.goto(`${href}/sections`);
}

async function setVisible(page: Page, visible: boolean) {
  await sectionsPage(page);
  const row = page.locator('[data-section-row]').filter({ hasText: SECTION });
  const box = row.getByRole('checkbox', { name: /Show on menu/ });
  if ((await box.isChecked()) !== visible) await box.setChecked(visible);
  await page.getByRole('button', { name: /Save/ }).click();
  await expect(page.getByRole('status').filter({ hasText: /Saved|Nothing changed/ })).toBeVisible();
}

test('a section can be hidden from the menu and shown again', async ({ page }) => {
  await signIn(page);
  await setVisible(page, false);

  await page.goto('/m/SBH001?lang=ar');
  await expect(page.getByRole('heading', { name: SECTION })).toHaveCount(0);

  await setVisible(page, true);
  await page.goto('/m/SBH001?lang=ar');
  await expect(page.getByRole('heading', { name: SECTION })).toBeVisible();
});

test('a visitor can show one section as a list and back as cards, without changing the others', async ({ page }) => {
  await page.goto('/m/SBH001?lang=ar');
  const section = page.locator('section[data-category]', { has: page.getByRole('heading', { name: SECTION }) });
  await section.scrollIntoViewIfNeeded();

  await section.locator('[data-section-view="list"]').click();
  await expect(section.locator('[data-section-view="list"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(section.locator('[data-section-layout="list"]')).toBeVisible();

  await section.locator('[data-section-view="cards"]').click();
  await expect(section.locator('[data-section-view="cards"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(section.locator('[data-section-layout="list"]')).toHaveCount(0);
});
