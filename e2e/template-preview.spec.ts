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

  // Navigated rather than fetched with `page.request`: under `next start` the
  // session cookie is Secure, which the browser sends to 127.0.0.1 but the
  // API request client does not.
  for (const id of [...new Set(ids)]) {
    const response = await page.goto(`/admin/businesses/${id}`);
    if (response?.ok() && (await page.content()).includes(`/m/${publicId}`)) return id;
  }

  return '';
}

test.describe('the template preview', () => {
  test('the design page frames real profile content, not an empty document', async ({
    page,
  }) => {
    await signIn(page);
    const businessId = await businessIdFor(page, 'DEM001');
    expect(businessId).not.toBe('');

    await page.goto(`/admin/businesses/${businessId}/design`);

    const frame = page.frameLocator('iframe[title="Menu preview"]');

    // The profile root is what the real renderer emits. An empty or errored
    // frame has no such element, which is the failure this catches.
    await expect(frame.locator('[data-profile-root]')).toBeVisible({ timeout: 20_000 });
    // And it must carry actual menu content, not just a shell.
    await expect(frame.locator('[data-item]').first()).toBeAttached({ timeout: 20_000 });

    // Each photo layout card frames the same menu in that layout.
    for (const key of ['a', 'b', 'c']) {
      const card = page.frameLocator(`.build__style-frame iframe[src*="variant=${key}"]`);
      await expect(card.locator(`[data-profile-root][data-variant="${key}"]`)).toBeAttached({
        timeout: 20_000,
      });
    }
  });

  test('the old brand and template addresses lead to the design page', async ({ page }) => {
    await signIn(page);
    const businessId = await businessIdFor(page, 'DEM001');

    for (const old of ['brand', 'template']) {
      await page.goto(`/admin/businesses/${businessId}/${old}`);
      await expect(page).toHaveURL(new RegExp(`/admin/businesses/${businessId}/design$`));
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

    const preview = await page.goto(`/admin/preview/${businessId}`);
    expect(preview?.status(), 'the staff preview must serve a draft business').toBe(200);
    expect(await page.content()).toContain('data-profile-root');
  });

  test('every photo layout renders through the preview route', async ({ page }) => {
    await signIn(page);
    const businessId = await businessIdFor(page, 'DEM001');
    const [design] = listTemplates();

    for (const variant of design!.variants) {
      for (const lang of ['ar', 'en'] as const) {
        const response = await page.goto(
          `/admin/preview/${businessId}?variant=${variant.key}&lang=${lang}`,
        );
        const label = `${variant.key} (${lang})`;

        expect(response?.status(), label).toBe(200);

        const html = await page.content();
        expect(html, `${label} must render the profile`).toContain('data-profile-root');
        expect(html, `${label} must select that layout`).toContain(`data-variant="${variant.key}"`);
        expect(html, `${label} must carry menu content`).toContain('data-item=');
        expect(html).toContain(`dir="${lang === 'ar' ? 'rtl' : 'ltr'}"`);
      }
    }
  });

  test('switching photo layout changes the layout and not the content', async ({ page }) => {
    await signIn(page);
    const businessId = await businessIdFor(page, 'DEM001');

    const itemsIn = (html: string) =>
      [...html.matchAll(/data-item="([A-Z0-9-]+)"/g)].map((match) => match[1]).sort();

    const html = async (url: string) => {
      await page.goto(url);
      return page.content();
    };

    const cards = await html(`/admin/preview/${businessId}?variant=a`);
    const list = await html(`/admin/preview/${businessId}?variant=b`);

    expect(cards).toContain('data-variant="a"');
    expect(list).toContain('data-variant="b"');

    // Same dishes, different layout. A preview that changed the content would
    // be lying about what publishing does.
    expect(itemsIn(cards).length).toBeGreaterThan(0);
    expect(itemsIn(cards)).toEqual(itemsIn(list));
    expect(cards).not.toBe(list);
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
