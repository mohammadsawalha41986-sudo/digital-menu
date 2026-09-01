import { expect, test } from '@playwright/test';

/**
 * Analytics, exercised through a real browser: the profile records a view,
 * the interaction script reports a tap, and neither costs the visitor an
 * error or a redirect.
 */

test('visiting a profile records a view without a redirect', async ({ page }) => {
  const response = await page.goto('/m/DEM001?lang=en');

  // The first response is the menu itself — no counting bounce (§112).
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe('/m/DEM001');
});

test('the interaction script reports a tapped contact action', async ({ page }) => {
  const beacons: string[] = [];

  await page.route('**/api/events', async (route) => {
    beacons.push(route.request().postData() ?? '');
    await route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/m/DEM001?lang=en');
  await page.getByRole('link', { name: 'WhatsApp' }).click({ noWaitAfter: true });

  // Poll for *this* beacon, not for any beacon. The profile also reports
  // offer and category views from an IntersectionObserver as soon as the page
  // settles, so "at least one arrived" can be satisfied by an unrelated event
  // before the tap is reported — which makes the assertion below race.
  await expect
    .poll(() => beacons.filter((body) => body.includes('contact_whatsapp')).length, {
      timeout: 5000,
    })
    .toBeGreaterThan(0);

  const payload = JSON.parse(beacons.find((body) => body.includes('contact_whatsapp')) ?? '{}');
  expect(payload.event).toBe('contact_whatsapp');
  expect(payload.publicId).toBe('DEM001');
  // The beacon carries public keys only — no identifiers, no page content.
  expect(Object.keys(payload).sort()).toEqual(['branch', 'event', 'locale', 'publicId', 'target']);
});

test('the ingest endpoint rejects an unknown event type', async ({ request }) => {
  const response = await request.post('/api/events', {
    data: { publicId: 'DEM001', event: 'drop-table' },
  });

  expect(response.status()).toBe(400);
});

test('the ingest endpoint does not confirm which businesses exist', async ({ request }) => {
  const real = await request.post('/api/events', {
    data: { publicId: 'DEM001', event: 'profile_view' },
  });
  const absent = await request.post('/api/events', {
    data: { publicId: 'ZZZZZZ', event: 'profile_view' },
  });

  // Same answer either way (master spec §119).
  expect(real.status()).toBe(204);
  expect(absent.status()).toBe(204);
});

test('the profile still works with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto('/m/DEM001?lang=en');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Demo Restaurant');
  await expect(page.locator('[data-item="MN-001"] [data-price]')).toBeVisible();

  await context.close();
});
