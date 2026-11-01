import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/admin';

/**
 * A staff link, end to end: the manager makes it, a person on the floor marks a
 * dish hidden, the public menu follows, the dish is put back, and the manager
 * revokes the link so it stops working.
 */

const DISH = 'SHW-001';
const LABEL = 'E2E front desk';

async function shareHref(page: Page): Promise<string> {
  await page.goto('/admin/businesses');
  const href = await page.locator('a[href="/m/SBH001"]').first().evaluate((link) =>
    link.closest('article')?.querySelector('a[href^="/admin/businesses/"]')?.getAttribute('href') ?? '',
  );
  expect(href).toBeTruthy();
  return `${href}/share`;
}

test.describe.configure({ mode: 'serial' });

test('a staff link hides a dish from the menu, puts it back, and stops working when revoked', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await signIn(page);
  await page.goto(await shareHref(page));

  // Make the link.
  await page.getByLabel('Name the link').fill(LABEL);
  await page.getByRole('button', { name: 'Create staff link' }).click();
  const link = page.locator('[role="status"] a[href*="/staff/"]').first();
  await expect(link).toBeVisible();
  const staffUrl = (await link.getAttribute('href')) ?? '';
  expect(staffUrl).toContain('/staff/');

  // The staff page, as a person on the floor sees it (no admin session needed).
  // A new context: no admin session, as a person on the floor would have.
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  await staff.goto(staffUrl);
  const row = staff.locator(`[data-item="${DISH}"]`);
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: /Hidden from menu/ }).click();
  await expect(row.getByRole('status')).toContainText('Hidden from the menu');
  await expect(row).toHaveAttribute('data-availability', 'HIDDEN');

  // The public menu no longer lists it.
  const visitor = await staffContext.newPage();
  await visitor.goto('/m/SBH001?lang=ar');
  await expect(visitor.locator('#menu-items-container')).toBeVisible();
  await expect(visitor.locator(`#menu-items-container [data-item="${DISH}"]`)).toHaveCount(0);

  // Put it back, and the menu shows it again.
  await staff.goto(staffUrl);
  await staff.locator(`[data-item="${DISH}"]`).getByRole('button', { name: /Available/ }).click();
  await expect(staff.locator(`[data-item="${DISH}"]`)).toHaveAttribute('data-availability', 'AVAILABLE');
  await visitor.goto('/m/SBH001?lang=ar');
  await expect(visitor.locator(`#menu-items-container [data-item="${DISH}"]`)).toHaveCount(1);

  // Revoke it from the admin. The same staff address now shows nothing.
  await page.goto(await shareHref(page));
  // The row is found by the link's own key, so an older link with the same name is never touched.
  const key = (staffUrl.split('/staff/')[1] ?? '').split('.')[0];
  expect(key).toBeTruthy();
  await page.locator(`[data-staff-link="${key}"]`).getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByRole('status')).toContainText('Link revoked');
  const response = await staff.goto(staffUrl);
  expect(response?.status()).toBe(404);

  await staffContext.close();
});
