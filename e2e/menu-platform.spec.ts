import { expect, test, type Page } from '@playwright/test';
import { openCommandPalette, signIn } from './support/admin';

/**
 * The multi-menu platform: per-menu addresses, embedding, search, ordering
 * and duplication — driven the way an operator and a visitor drive them.
 */

async function openBusiness(page: Page, publicId: string) {
  const search = await openCommandPalette(page);
  await search.fill(publicId);
  await page.getByRole('option').first().click();
  await expect(page).toHaveURL(/\/admin\/businesses\/[^/]+$/);
  return new URL(page.url()).pathname.split('/')[3] as string;
}

test.describe('per-menu public addresses', () => {
  test('a menu has an address of its own, and it shows only that menu', async ({ page }) => {
    await page.goto('/m/DEM001/menu/main?lang=en');

    const root = page.locator('[data-profile-root]');
    await expect(root).toBeVisible();
    await expect(page.locator('[data-item="ST-001"]')).toBeVisible();
  });

  test('an unknown menu key is not quietly answered with a different page', async ({ page }) => {
    // A menu URL is a printed QR's whole destination. Serving "all menus"
    // instead would be a different page than the one on the table.
    const response = await page.goto('/m/DEM001/menu/does-not-exist');
    expect(response?.status()).toBe(404);
  });

  test('the menu page is titled for the menu, not only the business', async ({ page }) => {
    await page.goto('/m/DEM001/menu/main?lang=en');
    await expect(page).toHaveTitle(/Main Menu/i);
  });

  test('the canonical URL points at the menu, not at the profile', async ({ page }) => {
    await page.goto('/m/DEM001/menu/main?lang=en');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/m\/DEM001\/menu\/main$/,
    );
  });
});

test.describe('embedding', () => {
  test('the embed renders the menu', async ({ page }) => {
    await page.goto('/embed/DEM001?lang=en');
    await expect(page.locator('[data-profile-root]')).toHaveAttribute('data-embed', '');
    await expect(page.locator('[data-item="ST-001"]')).toBeVisible();
  });

  test('the embed may be framed cross-origin; the public profile may not', async ({ request }) => {
    const embed = await request.get('/embed/DEM001');
    const csp = embed.headers()['content-security-policy'] ?? '';

    expect(csp).toContain('frame-ancestors *');
    // The old header has no "allow any origin" form, so sending it at all
    // would override the CSP in the browsers that still read it.
    expect(embed.headers()['x-frame-options']).toBeUndefined();

    const profile = await request.get('/m/DEM001');
    expect(profile.headers()['content-security-policy'] ?? '').toContain("frame-ancestors 'self'");
    expect(profile.headers()['x-frame-options']).toBe('SAMEORIGIN');
  });

  test('an embed is not indexed, so it cannot outrank the real menu', async ({ page }) => {
    await page.goto('/embed/DEM001');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('it actually works inside a frame, and reports its height', async ({ page, baseURL }) => {
    // A real page on this origin that frames the embed, so the message is
    // posted across a genuine frame boundary rather than simulated.
    await page.goto('/m/DEM001');

    // Append the frame; do not clear the body first.
    //
    // Clearing it raced React: hydration would commit after the wipe, restore
    // the profile's own tree, and take the injected iframe with it. About one
    // run in eight, the frame this test waits for had been deleted before it
    // ever loaded — which is what made this the suite's flakiest case. An
    // extra child alongside the hydrated root is left alone.
    await page.evaluate((src) => {
      (window as unknown as { __height: number }).__height = 0;
      window.addEventListener('message', (event: MessageEvent) => {
        const data = event.data as { type?: string; height?: number } | null;
        if (data && data.type === 'digital-menu:height') {
          (window as unknown as { __height: number }).__height = Number(data.height);
        }
      });
      const frame = document.createElement('iframe');
      frame.id = 'f';
      frame.src = src;
      frame.style.cssText = 'width:390px;height:200px;border:0';
      document.body.appendChild(frame);
    }, `${baseURL}/embed/DEM001?lang=en`);

    const frame = page.frameLocator('#f');
    // Generous: this loads a second full document inside the first, and under
    // a parallel suite that is the slowest thing either page does.
    await expect(frame.locator('[data-profile-root]')).toBeVisible({ timeout: 20_000 });

    // The host learns a real height rather than being left with its guess.
    await expect
      .poll(async () => page.evaluate(() => (window as unknown as { __height: number }).__height), {
        timeout: 10_000,
      })
      .toBeGreaterThan(200);
  });
});

test.describe('menu search', () => {
  test('filters the menu and hides sections that no longer match', async ({ page }) => {
    // DEM001 carries enough items for the control to be offered at all.
    await page.goto('/m/DEM001?lang=en');

    const search = page.locator('[data-menu-search]');
    await expect(search).toBeVisible();

    await search.getByRole('searchbox').fill('hummus');

    await expect(page.locator('[data-item="ST-001"]')).toBeVisible();
    await expect(page.locator('[data-item="DR-001"]')).toBeHidden();
    await expect(page.locator('[data-category="drinks"]')).toBeHidden();
    await expect(page.getByRole('status')).toContainText('result');
  });

  test('clearing brings everything back', async ({ page }) => {
    await page.goto('/m/DEM001?lang=en');

    const search = page.locator('[data-menu-search]');
    await search.getByRole('searchbox').fill('hummus');
    await search.getByRole('button', { name: 'Clear' }).click();

    await expect(page.locator('[data-item="DR-001"]')).toBeVisible();
    await expect(page.locator('[data-category="drinks"]')).toBeVisible();
  });

  test('is offered only where a menu is long enough to need it', async ({ page }) => {
    // The Arabic-only café has a handful of drinks; scrolling beats searching.
    await page.goto('/m/DEM002');
    await expect(page.locator('[data-menu-search]')).toHaveCount(0);
  });
});

test.describe('admin: links, embed, duplication and ordering', () => {
  test('the share screen offers a link and an embed for each published menu', async ({ page }) => {
    await signIn(page);
    const businessId = await openBusiness(page, 'DEM001');
    await page.goto(`/admin/businesses/${businessId}/share`);

    await expect(page.getByRole('heading', { name: 'Links, QR & embed' })).toBeVisible();

    // The profile's own link, and the menu's.
    await expect(page.getByRole('link', { name: /\/m\/DEM001$/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /\/m\/DEM001\/menu\/main$/ })).toBeVisible();

    // A ready-to-paste snippet, not just a URL.
    const snippet = page.locator('.admin__embed-code').first();
    await expect(snippet).toContainText('<iframe');
    await expect(snippet).toContainText('/embed/DEM001');
    await expect(snippet).toContainText('digital-menu:height');
  });

  test('duplicating a menu creates a draft rather than publishing a copy', async ({ page }) => {
    await signIn(page);
    const businessId = await openBusiness(page, 'DEM003');
    await page.goto(`/admin/businesses/${businessId}/share`);

    await page.getByRole('button', { name: 'Duplicate menu' }).first().click();

    await expect(page.getByRole('status').filter({ hasText: 'Duplicated as' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('Not published').first()).toBeVisible();
  });

  test('sections can be reordered without a mouse', async ({ page }) => {
    await signIn(page);
    const businessId = await openBusiness(page, 'DEM001');
    await page.goto(`/admin/businesses/${businessId}/menus`);

    const sections = page.locator('[data-category-admin]');
    const before = await sections.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-category-admin')),
    );
    expect(before.length).toBeGreaterThan(1);

    // The first row cannot move up — the control says so rather than failing.
    await expect(
      page.locator('[data-category-admin]').first().getByRole('button', { name: /Move .* up/ }),
    ).toBeDisabled();

    await page
      .locator('[data-category-admin]')
      .first()
      .getByRole('button', { name: /Move .* down/ })
      .click();

    await expect
      .poll(async () =>
        page
          .locator('[data-category-admin]')
          .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-category-admin'))),
      )
      .not.toEqual(before);

    /*
     * Put it back.
     *
     * This drives the *seeded* demo, which other suites assert on — an
     * integration test checks that DEM001's sections load in their configured
     * order, and it started failing because this test left them reordered.
     * A test that mutates shared fixture data has to restore it, or it is not
     * testing the system so much as reshaping it for everything that follows.
     */
    await page
      .locator(`[data-category-admin="${before[0]}"]`)
      .getByRole('button', { name: /Move .* up/ })
      .click();

    await expect
      .poll(async () =>
        page
          .locator('[data-category-admin]')
          .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-category-admin'))),
      )
      .toEqual(before);
  });
});
