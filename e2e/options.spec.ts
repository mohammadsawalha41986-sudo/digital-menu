import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/admin';

async function optionsPage(page: Page) {
  await page.goto('/admin/businesses');
  const href = await page.locator('a[href="/m/SBH001"]').first().evaluate((link) =>
    link.closest('article')?.querySelector('a[href^="/admin/businesses/"]')?.getAttribute('href') ?? '',
  );
  await page.goto(`${href}/options`);
}

test('a required choice with a price reaches the dish sheet, the cart and the WhatsApp order', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await signIn(page);
  await optionsPage(page);

  // Start from the "required choice" pattern (rice type), price one option,
  // and put it on one dish.
  await page.getByRole('button', { name: /اختيار إجباري/ }).click();
  const editor = page.getByRole('region', { name: 'Group editor' });
  await editor.getByLabel('خيار 2 — السعر').fill('3');
  await editor.getByLabel('شاورما عربي', { exact: true }).check();
  await editor.getByRole('button', { name: /Save/ }).click();
  const group = page.locator('[data-option-group="نوع الرز"]');
  await expect(group).toContainText('على 1 طبق');

  await page.goto('/m/SBH001?lang=ar');
  const card = page.locator('#menu-items-container [data-item="SHW-001"]');
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button').last().click();

  // Nothing is added before the required choice is made.
  const add = page.getByRole('button', { name: /إضافة إلى الطلب|اختر نوع الرز/ });
  await add.click();
  await expect(add).toContainText('اختر نوع الرز');
  await expect(page.locator('[data-choice-rule]')).toContainText('إجباري');

  await page.getByRole('radio', { name: /رز مندي/ }).click();
  await expect(add).toContainText('12.00');
  await add.click();

  await expect(page.locator('[data-cart-choice]')).toContainText('نوع الرز: رز مندي');

  await page.evaluate(() => {
    window.open = ((url: string) => {
      (window as unknown as { openedUrl: string }).openedUrl = url;
      return null;
    }) as typeof window.open;
  });
  await page.getByRole('button', { name: /إرسال الطلب عبر واتساب/ }).click();
  const opened = await page.evaluate(() => (window as unknown as { openedUrl?: string }).openedUrl ?? '');
  const text = decodeURIComponent(opened.split('?text=')[1] ?? '');
  expect(text).toContain('شاورما عربي');
  expect(text).toContain('12.00');
  expect(text).toContain('نوع الرز: رز مندي');

  // Restore, so the suite is re-runnable.
  await optionsPage(page);
  await group.getByRole('button', { name: /Delete/ }).click();
  await expect(group).toHaveCount(0);
});
