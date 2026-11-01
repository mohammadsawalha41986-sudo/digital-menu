import { devices, expect, test, type Page } from '@playwright/test';

/**
 * The welcome message a visitor sees when the menu opens: what it says, that it
 * leaves on its own, that it never blocks the menu, and that it is shown once
 * per visit rather than on every reload.
 */

const MENU = '/m/SBH001';

/** Resolves once the page's scripts are attached (the install offer marks it). */
async function ready(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.installReady === 'true')).toBe(true);
}

test.describe('the welcome message', () => {
  test('greets an Arabic visitor by the restaurant name, then leaves on its own', async ({ page }) => {
    await page.goto(`${MENU}?lang=ar`);
    const welcome = page.locator('[data-welcome]');
    await expect(welcome).toBeVisible();
    await expect(welcome).toContainText('أهلاً بك في مطعم صباح الليل');
    await expect(welcome).toHaveAttribute('dir', 'rtl');
    await expect(welcome).toHaveCount(0, { timeout: 12_000 });
  });

  test('greets an English visitor in English, left to right', async ({ page }) => {
    await page.goto(`${MENU}?lang=en`);
    const welcome = page.locator('[data-welcome]');
    await expect(welcome).toBeVisible();
    await expect(welcome).toContainText('Welcome to Sabah El Lail');
    await expect(welcome).toHaveAttribute('dir', 'ltr');
  });

  test('does not block the menu: a dish opens while the message is up', async ({ page }) => {
    await page.goto(`${MENU}?lang=ar`);
    await expect(page.locator('[data-welcome]')).toBeVisible();
    await page.locator('#menu-items-container [data-item]').first().getByRole('button').last().click();
    await expect(page.getByRole('button', { name: /إضافة إلى الطلب/ })).toBeVisible();
  });

  test('its close button dismisses it', async ({ page }) => {
    await page.goto(`${MENU}?lang=ar`);
    await expect(page.locator('[data-welcome]')).toBeVisible();
    await page.getByRole('button', { name: 'إغلاق الرسالة' }).click();
    await expect(page.locator('[data-welcome]')).toHaveCount(0);
  });

  test('is shown once per visit: a reload does not repeat it, a new visit does', async ({ browser }) => {
    const context = await browser.newContext({ ...devices['Pixel 7'] });

    const first = await context.newPage();
    await first.goto(`${MENU}?lang=ar`);
    await expect(first.locator('[data-welcome]')).toBeVisible();
    await first.getByRole('button', { name: 'إغلاق الرسالة' }).click();
    await first.reload();
    await ready(first);
    await expect(first.locator('[data-welcome]')).toHaveCount(0);

    // A new tab is a new visit.
    const second = await context.newPage();
    await second.goto(`${MENU}?lang=ar`);
    await expect(second.locator('[data-welcome]')).toBeVisible();
    await context.close();
  });
});
