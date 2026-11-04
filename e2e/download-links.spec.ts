import { expect, test } from '@playwright/test';
import { signIn } from './support/admin';

/**
 * Links the live site was serving as 404s (found in the production request
 * log): the builder's "Download the template" button, and /favicon.ico, which
 * every browser and link preview asks for.
 */

test('the builder’s “Download the template” link downloads the Excel template', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/businesses');
  const businessHref = await page.locator('a[href="/m/SBH001"]').first().evaluate((link) =>
    link.closest('article')?.querySelector('a[href^="/admin/businesses/"]')?.getAttribute('href') ?? '',
  );
  const businessId = businessHref.split('/')[3];
  expect(businessId).toBeTruthy();

  await page.goto(`/admin/build/${businessId}/menu`);
  const href = await page.getByRole('link', { name: 'Download the template' }).getAttribute('href');
  expect(href).toBeTruthy();

  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('spreadsheetml');
  expect((await response.body()).subarray(0, 2).toString()).toBe('PK');
});

test('/favicon.ico is served', async ({ request }) => {
  const response = await request.get('/favicon.ico');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/icon/);
});
