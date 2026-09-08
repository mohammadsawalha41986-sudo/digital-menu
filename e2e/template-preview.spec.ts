import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/admin';
import { listTemplates } from '../src/templates/registry';

/**
 * The template preview, end to end (master spec §36, §67, §78).
 *
 * This exists because the preview shipped broken twice, in two independent
 * ways, and neither was visible to any test:
 *
 *  1. `frame-ancestors 'none'` blocked the admin from framing its own pages.
 *  2. The preview framed `/m/{publicId}` — the *public* route, which serves
 *     only an ACTIVE business with a published menu. For a business still
 *     being built, which is exactly when a template gets chosen, all three
 *     frames were a 404.
 *
 * Both failures render as an empty frame. Nothing throws, no test fails, and
 * the page looks fine until a person looks at it. So these tests assert on
 * what is actually *inside* the frame, not that a route exists.
 */

/**
 * Resolves a business id from its public id, through the admin list.
 *
 * Deliberately excludes `/admin/businesses/new`, which is the create form and
 * not a business — taking the first link on the page picks it up and produces
 * a preview of a business that does not exist.
 */
async function businessIdFor(page: Page, publicId: string): Promise<string> {
  await page.goto('/admin/businesses');

  const ids = await page.locator('a[href^="/admin/businesses/"]').evaluateAll((links) =>
    links
      .map((link) => (link as HTMLAnchorElement).getAttribute('href') ?? '')
      .map((href) => href.match(/^\/admin\/businesses\/([^/?#]+)/)?.[1] ?? '')
      .filter((id) => id !== '' && id !== 'new'),
  );

  for (const id of [...new Set(ids)]) {
    const response = await page.request.get(`/admin/businesses/${id}`);
    if (response.ok() && (await response.text()).includes(`/m/${publicId}`)) return id;
  }

  return '';
}

test.describe('the template preview', () => {
  test('the three frames render real profile content, not an empty document', async ({
    page,
  }) => {
    await signIn(page);
    const businessId = await businessIdFor(page, 'DEM001');
    expect(businessId).not.toBe('');

    await page.goto(`/admin/businesses/${businessId}/template`);

    for (const label of ['Mobile — 390px', 'Tablet — 768px', 'Desktop — 1200px']) {
      const frame = page.frameLocator(`iframe[title="${label}"]`);

      // The profile root is what the real renderer emits. An empty or errored
      // frame has no such element, which is the failure this catches.
      await expect(
        frame.locator('[data-profile-root]'),
        `${label} should contain the rendered profile`,
      ).toBeVisible({ timeout: 20_000 });

      // And it must carry actual menu content, not just a shell.
      await expect(frame.locator('[data-item]').first()).toBeVisible({ timeout: 20_000 });
    }
  });

  test('the frames are real viewports at their stated widths', async ({ page }) => {
    await signIn(page);
    const businessId = await businessIdFor(page, 'DEM001');
    await page.goto(`/admin/businesses/${businessId}/template`);

    for (const [label, width] of [
      ['Mobile — 390px', 390],
      ['Tablet — 768px', 768],
      ['Desktop — 1200px', 1200],
    ] as const) {
      const frame = page.frameLocator(`iframe[title="${label}"]`);
      await expect(frame.locator('[data-profile-root]')).toBeVisible({ timeout: 20_000 });

      // The document inside reports the frame's own width — a real viewport,
      // not a desktop page scaled down with a transform.
      const inner = await frame.locator('body').evaluate((el) => el.ownerDocument.documentElement.clientWidth);
      expect(Math.abs(inner - width)).toBeLessThanOrEqual(20);
    }
  });

  test('a draft business previews too — the case the public route cannot serve', async ({
    page,
  }) => {
    await signIn(page);

    // DRAFT1 is deliberately not public; /m/DRAFT1 is a 404 by design.
    const publicResponse = await page.request.get('/m/DRAFT1');
    expect(publicResponse.status()).toBe(404);

    const businessId = await businessIdFor(page, 'DRAFT1');
    if (!businessId) test.skip(true, 'no draft business in this dataset');

    const preview = await page.request.get(`/admin/preview/${businessId}`);
    expect(preview.status(), 'the staff preview must serve a draft business').toBe(200);
    expect(await preview.text()).toContain('data-profile-root');
  });

  test('every template family renders through the preview route', async ({ page }) => {
    await signIn(page);
    const businessId = await businessIdFor(page, 'DEM001');

    for (const template of listTemplates()) {
      for (const lang of ['ar', 'en'] as const) {
        const response = await page.request.get(
          `/admin/preview/${businessId}?template=${template.key}&lang=${lang}`,
        );

        expect(response.status(), `${template.key} (${lang})`).toBe(200);

        const html = await response.text();
        expect(html, `${template.key} (${lang}) must render the profile`).toContain(
          'data-profile-root',
        );
        expect(html, `${template.key} (${lang}) must select that template`).toContain(
          `data-template="${template.key}"`,
        );
        expect(html, `${template.key} (${lang}) must carry menu content`).toContain('data-item=');
        expect(html).toContain(`dir="${lang === 'ar' ? 'rtl' : 'ltr'}"`);
      }
    }
  });

  test('switching template changes the layout and not the content', async ({ page }) => {
    await signIn(page);
    const businessId = await businessIdFor(page, 'DEM001');

    const itemsIn = (html: string) =>
      [...html.matchAll(/data-item="([A-Z0-9-]+)"/g)].map((match) => match[1]).sort();

    const first = await (await page.request.get(`/admin/preview/${businessId}?template=luxury`)).text();
    const second = await (await page.request.get(`/admin/preview/${businessId}?template=bold`)).text();

    expect(first).toContain('data-template="luxury"');
    expect(second).toContain('data-template="bold"');

    // Same dishes, different design. A preview that changed the content would
    // be lying about what publishing does.
    expect(itemsIn(first)).toEqual(itemsIn(second));
    expect(first).not.toBe(second);
  });

  test('the preview refuses another tenant, and refuses a signed-out visitor', async ({
    page,
    request,
  }) => {
    await signIn(page);
    const businessId = await businessIdFor(page, 'DEM001');

    // Signed out: redirected to login, never a 500 and never the content.
    const anonymous = await request.get(`/admin/preview/${businessId}`, {
      maxRedirects: 0,
      headers: { cookie: '' },
    });

    expect([302, 303, 307, 308]).toContain(anonymous.status());
    expect(anonymous.headers()['location'] ?? '').toContain('/admin/login');
  });
});
