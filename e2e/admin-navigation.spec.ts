import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/admin';

/**
 * The navigation every page of one restaurant shares: where you are, one way
 * back, and the main areas as tabs. A restaurant's pages are never a dead end.
 */

/** Opens the first restaurant in the list and returns its id. */
async function openFirstRestaurant(page: Page): Promise<string> {
  await page.goto('/admin/businesses');
  const href = await page.locator('a[href^="/admin/businesses/"]').evaluateAll((links) => {
    const paths = links.map((link) => link.getAttribute('href') ?? '');
    return paths.find((path) => /^\/admin\/businesses\/[^/]+$/.test(path) && !path.endsWith('/new')) ?? null;
  });
  expect(href).not.toBeNull();
  await page.goto(href as string);
  const parts = (href as string).split('/');
  return parts[3] ?? '';
}

test.describe('restaurant navigation', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('a restaurant opens with its breadcrumb, a next step, and its areas as tabs', async ({ page }) => {
    const id = await openFirstRestaurant(page);

    const nav = page.getByRole('navigation', { name: 'Restaurant navigation' });
    await expect(nav).toBeVisible();
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: /المطاعم · Restaurants/ })).toHaveAttribute('href', '/admin/businesses');

    // On the home, the overview tab is the current page, and there is one next step.
    await expect(nav.getByRole('link', { name: /الرئيسية · Overview/ })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('section.hub__next')).toBeVisible();

    // A tab leads to its area, and the tab for that area is then the current one.
    await nav.getByRole('link', { name: /الأقسام · Sections/ }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/businesses/${id}/sections$`));
    await expect(nav.getByRole('link', { name: /الأقسام · Sections/ })).toHaveAttribute('aria-current', 'page');

    // The back button returns to the restaurant's home, not to the list.
    await nav.getByRole('link', { name: /رجوع إلى المطعم/ }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/businesses/${id}$`));

    // From the home, back goes to the list of restaurants.
    await nav.getByRole('link', { name: /رجوع إلى المطاعم/ }).click();
    await expect(page).toHaveURL(/\/admin\/businesses$/);
  });

  test('the builder shares the same navigation and its own tab is current', async ({ page }) => {
    const id = await openFirstRestaurant(page);
    await page.goto(`/admin/build/${id}/builder`);

    const nav = page.getByRole('navigation', { name: 'Restaurant navigation' });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link', { name: /الأطباق · Dishes/ })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: /رجوع إلى المطعم/ })).toHaveAttribute('href', `/admin/businesses/${id}`);
  });

  test('every page of a restaurant has exactly one back button to its home', async ({ page }) => {
    test.setTimeout(180_000);
    const id = await openFirstRestaurant(page);

    const pages = [
      `/admin/businesses/${id}/options`,
      `/admin/businesses/${id}/upsell`,
      `/admin/businesses/${id}/sections`,
      `/admin/businesses/${id}/design`,
      `/admin/businesses/${id}/qr`,
      `/admin/businesses/${id}/analytics`,
      `/admin/businesses/${id}/discounts`,
      `/admin/businesses/${id}/hours`,
      `/admin/businesses/${id}/branches`,
      `/admin/businesses/${id}/offers`,
      `/admin/businesses/${id}/media`,
      `/admin/businesses/${id}/files`,
      `/admin/businesses/${id}/history`,
      `/admin/businesses/${id}/health`,
      `/admin/businesses/${id}/data`,
      `/admin/businesses/${id}/nutrition`,
      `/admin/businesses/${id}/share`,
      `/admin/build/${id}/review`,
      `/admin/build/${id}/builder`,
    ];

    for (const path of pages) {
      await page.goto(path);
      await expect(page.getByRole('navigation', { name: 'Restaurant navigation' }), path).toBeVisible();
      await expect(page.getByRole('link', { name: /رجوع إلى المطعم/ }), path).toHaveCount(1);
    }
  });

  test('the navigation fits a phone without sideways scrolling', async ({ page }) => {
    const id = await openFirstRestaurant(page);
    await expect(page.getByRole('navigation', { name: 'Restaurant navigation' })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(id).toBeTruthy();
  });
});
