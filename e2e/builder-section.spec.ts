import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/admin';

/**
 * Moving a dish to another section in the builder. The save must keep the new
 * section on the open form, not show the old one, while the dish is listed
 * under the new section.
 */

async function openBuilder(page: Page): Promise<void> {
  await page.goto('/admin/businesses');
  const href = await page.locator('a[href="/m/SBH001"]').first().evaluate((link) =>
    link.closest('article')?.querySelector('a[href^="/admin/businesses/"]')?.getAttribute('href') ?? '',
  );
  const id = href.split('/')[3];
  expect(id).toBeTruthy();
  await page.goto(`/admin/build/${id}/builder`);
}

test('a dish moved to another section keeps the new section on the open form', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  await openBuilder(page);

  const dish = page.locator('.build__item-button', { hasText: 'Chicken Tenders' }).first();
  await dish.click();
  const select = page.locator('#item-category');
  await select.waitFor();
  const original = await select.inputValue();
  const target = (await select.locator('option').evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value)))
    .find((value) => value !== original);
  expect(target).toBeTruthy();

  await select.selectOption(target as string);
  await page.getByRole('button', { name: 'Save dish' }).click();
  await expect(page.locator('.admin__message', { hasText: 'Dish saved' })).toBeVisible();

  // The form shows the section it was saved in, after the page has refreshed.
  await expect(select).toHaveValue(target as string);
  await expect(
    page.locator(`[data-builder-section="${target}"] .build__item-button`, { hasText: 'Chicken Tenders' }),
  ).toHaveCount(1);

  // Put the demo dish back where it was, so other specs see the same menu.
  await select.selectOption(original);
  await page.getByRole('button', { name: 'Save dish' }).click();
  await expect(page.locator('.admin__message', { hasText: 'Dish saved' })).toBeVisible();
});
