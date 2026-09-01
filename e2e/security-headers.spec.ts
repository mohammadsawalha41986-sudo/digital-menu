import { expect, test } from '@playwright/test';

/**
 * Security response headers, and the one place they must *not* be absolute.
 *
 * The admin frames the real public profile in four places — the Menu Studio's
 * live preview, the template picker, and the guided builder's style step and
 * preview pane. `frame-ancestors 'none'` blocks same-origin framing too, which
 * empties every one of those panes while each page still looks fine on its
 * own. That shipped once; this is the test that stops it shipping again.
 */

test('the public profile carries the security headers', async ({ request }) => {
  const response = await request.get('/m/DEM001');
  const headers = response.headers();

  expect(headers['content-security-policy']).toBeTruthy();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
});

test('framing is restricted to this origin, not forbidden outright', async ({ request }) => {
  const response = await request.get('/m/DEM001');
  const headers = response.headers();

  expect(headers['x-frame-options']?.toUpperCase()).toBe('SAMEORIGIN');
  expect(headers['content-security-policy']).toContain("frame-ancestors 'self'");
  expect(headers['content-security-policy']).not.toContain("frame-ancestors 'none'");
});

test('the CSP permits no external origin', async ({ request }) => {
  const csp = (await request.get('/m/DEM001')).headers()['content-security-policy'] ?? '';

  // Fonts, scripts, styles and images are all first-party. If one of these
  // ever gains an external origin it should be a deliberate edit, not a drift.
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).not.toMatch(/https?:\/\//);
});

test('a public profile actually renders inside a same-origin frame', async ({ page }) => {
  // The end the headers exist to serve: the studio preview is this, in a page.
  // Framed from a same-origin admin page, exactly as the studio does it.
  await page.goto('/admin/login');
  await page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.title = 'probe';
    frame.src = '/m/DEM001?lang=ar';
    frame.width = '390';
    frame.height = '600';
    document.body.append(frame);
  });

  const framed = page.frameLocator('iframe[title="probe"]');
  await expect(framed.locator('[data-profile-root]')).toBeVisible({ timeout: 15_000 });
});
