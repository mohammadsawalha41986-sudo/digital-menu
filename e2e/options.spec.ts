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

test('choose two drinks: the same drink twice, a live "0 of 2" counter, calories that follow the choice', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await signIn(page);
  await optionsPage(page);

  // The drinks pattern: required, choose 2, each drink up to twice.
  await page.getByRole('button', { name: /مشروبات/ }).click();
  const editor = page.getByRole('region', { name: 'Group editor' });
  await editor.getByLabel('خيار 1 — سعرات حرارية').fill('150');
  await editor.getByLabel('شاورما تركي', { exact: true }).check();
  await editor.getByRole('button', { name: /Save/ }).click();
  const group = page.locator('[data-option-group="اختر المشروب"]');
  await expect(group).toContainText('على 1 طبق');
  await expect(group).toContainText('2 على الأقل');

  await page.goto('/m/SBH001?lang=ar');
  const card = page.locator('#menu-items-container [data-item="SHW-002"]');
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button').last().click();

  const rule = page.locator('[data-choice-group]').filter({ hasText: 'اختر المشروب' }).locator('[data-choice-rule]');
  await expect(rule).toContainText('(0 من 2)');
  await expect(page.locator('[data-sheet-calories]')).toHaveAttribute('data-sheet-calories', '520');

  const more = page.getByRole('button', { name: 'زيادة بيبسي' });
  await more.click();
  await more.click();
  await expect(rule).toContainText('(2 من 2)');
  await expect(page.locator('[data-choice]').filter({ hasText: 'بيبسي' })).toHaveAttribute('data-count', '2');
  // The group is full: no third drink.
  await expect(more).toBeDisabled();
  await expect(page.getByRole('button', { name: 'زيادة ماء' })).toBeDisabled();
  // 520 + 2 × 150.
  await expect(page.locator('[data-sheet-calories]')).toHaveAttribute('data-sheet-calories', '820');

  const add = page.getByRole('button', { name: /إضافة إلى الطلب/ });
  await add.click();
  await expect(page.locator('[data-cart-choice]')).toContainText('بيبسي ×2');

  await page.evaluate(() => {
    window.open = ((url: string) => {
      (window as unknown as { openedUrl: string }).openedUrl = url;
      return null;
    }) as typeof window.open;
  });
  await page.getByRole('button', { name: /إرسال الطلب عبر واتساب/ }).click();
  const opened = await page.evaluate(() => (window as unknown as { openedUrl?: string }).openedUrl ?? '');
  expect(decodeURIComponent(opened.split('?text=')[1] ?? '')).toContain('اختر المشروب: بيبسي ×2');

  await optionsPage(page);
  await group.getByRole('button', { name: /Delete/ }).click();
  await expect(group).toHaveCount(0);
});
