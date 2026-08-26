import { expect, test } from '@playwright/test';

/**
 * Phase 0 smoke journey.
 *
 * Scope is deliberately narrow: prove that the foundation the later phases
 * stand on actually works end to end — the app serves, the health endpoint
 * reports its dependencies, a public identifier resolves through the database,
 * and both writing directions render natively.
 *
 * The full §138 journey (create → publish → QR → change price → same QR) is
 * Phase 2/3 work; this file exists so that journey has somewhere to land.
 */

test('health endpoint reports application, database and storage', async ({ request }) => {
  const response = await request.get('/api/health');

  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.status).toBe('ok');
  expect(body.checks).toMatchObject({ application: 'up', database: 'up', storage: 'up' });

  // A health probe must not leak configuration.
  const raw = JSON.stringify(body);
  expect(raw).not.toContain('postgresql://');
  expect(raw).not.toMatch(/secret/i);
});

test('the application root loads', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Digital Profile OS' })).toBeVisible();
});

test('a public identifier resolves to a profile', async ({ page }) => {
  await page.goto('/m/DEM001?lang=ar');

  const root = page.locator('[data-profile-root]');
  await expect(root).toHaveAttribute('data-template', 'editorial');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('مطعم النموذج');

  // The published menu is visible; the draft menu is not.
  await expect(page.getByText('المنيو الرئيسي')).toBeVisible();
  await expect(page.getByText('قائمة موسمية')).toHaveCount(0);
});

test("a visitor's device language is honoured when they have expressed no choice", async ({
  page,
}) => {
  // This viewport sends `Accept-Language: en-US`. The business defaults to
  // Arabic, but an explicit device preference outranks a configured default —
  // see docs/ARCHITECTURE.md §7.
  await page.goto('/m/DEM001');
  await expect(page.locator('[data-profile-root]')).toHaveAttribute('data-locale', 'en');
});

test('Arabic renders right-to-left', async ({ page }) => {
  await page.goto('/m/DEM001?lang=ar');

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');

  const root = page.locator('[data-profile-root]');
  await expect(root).toHaveAttribute('dir', 'rtl');
  await expect(root).toHaveAttribute('data-locale', 'ar');

  // Direction must be a real computed layout direction, not just an attribute.
  await expect(root).toHaveCSS('direction', 'rtl');
});

test('English renders left-to-right', async ({ page }) => {
  await page.goto('/m/DEM001?lang=en');

  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

  const root = page.locator('[data-profile-root]');
  await expect(root).toHaveAttribute('dir', 'ltr');
  await expect(root).toHaveCSS('direction', 'ltr');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Demo Restaurant');
});

test('switching language keeps the permanent URL intact', async ({ page }) => {
  await page.goto('/m/DEM001');
  await page.getByRole('link', { name: 'English' }).click();

  await expect(page.locator('[data-profile-root]')).toHaveAttribute('data-locale', 'en');
  // The path — the part a QR code encodes — is unchanged (GOALS I1/I2).
  expect(new URL(page.url()).pathname).toBe('/m/DEM001');
});

test('Arabic-only content is shown as Arabic rather than machine-translated', async ({ page }) => {
  await page.goto('/m/DEM002?lang=en');

  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toHaveText('مقهى النموذج');
  // Marked with its true language so the browser and assistive tech treat it
  // as Arabic inside an English page (GOALS I9).
  await expect(heading).toHaveAttribute('lang', 'ar');
  await expect(heading).toHaveAttribute('dir', 'rtl');
});

test('a draft business is not publicly readable', async ({ page }) => {
  const response = await page.goto('/m/DRAFT1?lang=ar');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('الصفحة غير متاحة');
});

test('an unknown or malformed identifier shows the neutral unavailable state', async ({ page }) => {
  for (const path of ['/m/ZZZZZZ', '/m/18473']) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});

test('no horizontal overflow at the primary mobile widths', async ({ page }) => {
  // master spec §139.
  for (const width of [360, 375, 390, 414, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/m/DEM001');

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows, `viewport ${width}px`).toBe(false);
  }
});
