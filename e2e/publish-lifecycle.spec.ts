import { expect, test } from '@playwright/test';
import { signIn } from './support/admin';

/**
 * Taking a menu down, and putting it back.
 *
 * The suite proved that a business seeded as DRAFT is not publicly readable.
 * It never proved the *transition* — that a business already being served
 * publicly stops being served the moment its owner takes it down, and returns
 * when they change their mind. Those are different claims, and only the second
 * one is what an owner actually does.
 *
 * The failure it guards against is a menu that keeps answering after being
 * withdrawn, to anyone holding the URL, with nothing in the admin to suggest
 * it — and a printed QR makes that URL permanent. So the public page is
 * visited while it is live, before the business is taken down, rather than
 * only afterwards.
 */

const RUN = Date.now().toString(36).slice(-6);

test('a published menu goes away when unpublished, and comes back when republished', async ({
  page,
}) => {
  test.slow();

  await signIn(page);

  // ---- A published business ----------------------------------------------
  await page.goto('/admin/businesses/new');
  await page.getByLabel('Name (Arabic)').fill('مطعم النشر');
  await page.getByLabel('Name (English)').fill('Lifecycle Restaurant');
  await page.getByLabel('Slug').fill(`lifecycle-${RUN}`);
  await page.getByLabel('Status').selectOption('ACTIVE');
  await page.getByRole('button', { name: 'Create business' }).click();

  await expect(page.getByRole('heading', { name: 'Lifecycle Restaurant' })).toBeVisible();
  const businessId = page.url().split('/admin/businesses/')[1]?.split('/')[0] ?? '';
  expect(businessId).not.toBe('');

  const publicPath = (
    await page.getByRole('link', { name: /^\/m\/[0-9A-HJ-KM-NP-TV-Z]{6}$/ }).textContent()
  )?.trim();
  expect(publicPath).toBeTruthy();

  // ---- Publicly readable, and now cached ---------------------------------
  const live = await page.goto(publicPath!);
  expect(live?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/مطعم النشر|Lifecycle/);

  // ---- Taken down ---------------------------------------------------------
  await page.goto(`/admin/businesses/${businessId}`);
  await page.getByLabel('Status').selectOption('INACTIVE');
  await page.getByRole('button', { name: 'Save business' }).click();
  await expect(page.getByRole('status').first()).toBeVisible();

  // Nothing served earlier may outlive the decision to take it down.
  const down = await page.goto(publicPath!);
  expect(down?.status(), 'an unpublished menu is still being served').toBe(404);

  // ---- Put back -----------------------------------------------------------
  await page.goto(`/admin/businesses/${businessId}`);
  await page.getByLabel('Status').selectOption('ACTIVE');
  await page.getByRole('button', { name: 'Save business' }).click();
  await expect(page.getByRole('status').first()).toBeVisible();

  // The same URL, because a printed QR cannot be reissued.
  const back = await page.goto(publicPath!);
  expect(back?.status(), 'a republished menu did not come back').toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/مطعم النشر|Lifecycle/);
});
