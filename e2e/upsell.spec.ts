import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/admin';

async function upsellPage(page: Page) {
  await page.goto('/admin/businesses');
  const href = await page.locator('a[href="/m/DEM006"]').first().evaluate((link) =>
    link.closest('article')?.querySelector('a[href^="/admin/businesses/"]')?.getAttribute('href') ?? '',
  );
  await page.goto(`${href}/upsell`);
}

test('a dish suggests what the restaurant pairs with it, and new dishes are marked', async ({ page }) => {
  await signIn(page);
  await upsellPage(page);

  const rows = page.locator('[data-upsell]');
  const first = rows.first();
  const second = rows.nth(1);
  const firstCode = await first.getAttribute('data-upsell');
  const secondCode = await second.getAttribute('data-upsell');
  const secondName = (await second.locator('.upsell__name').textContent())?.trim() ?? '';

  await first.locator('select[name="pairsWith"]').first().selectOption(secondCode ?? '');
  await first.getByLabel('New').check();
  await first.getByRole('button', { name: /Save/ }).click();
  await expect(first.getByRole('status')).toContainText('Saved');

  await page.goto('/m/DEM006?lang=ar');
  const card = page.locator(`#menu-items-container [data-item="${firstCode}"]`);
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('[data-new]')).toBeVisible();

  // The dish sheet suggests the paired dish, and one tap adds it.
  await card.getByRole('button').last().click();
  const suggestion = page.locator(`[data-suggestion="${secondCode}"]`);
  await expect(suggestion).toContainText(secondName);
  await suggestion.getByRole('button').click();
  await expect(suggestion.getByRole('button')).toContainText('أُضيف');

  // Restore, so the suite is re-runnable.
  await upsellPage(page);
  const again = page.locator(`[data-upsell="${firstCode}"]`);
  await again.locator('select[name="pairsWith"]').first().selectOption('');
  await again.getByLabel('New').uncheck();
  await again.getByRole('button', { name: /Save/ }).click();
  await expect(again.getByRole('status')).toContainText('Saved');
});
