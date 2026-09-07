import { expect, test, type Page } from '@playwright/test';

/**
 * Every admin route, rendered.
 *
 * This exists because of a defect that shipped: the Media page passed two
 * inline closures to a client component instead of the server-action
 * references those props expected. Nothing caught it. The unit suite never
 * renders a page, `next build` compiles closures happily, and the e2e suite
 * only visited the handful of routes its journeys happened to cross — Media
 * was not one of them. The result was a hard 500 on a route every other
 * check called healthy.
 *
 * So the guard is deliberately dumb and deliberately total: walk the whole
 * admin surface and assert each route renders. A route that 500s, or that
 * renders Next's error boundary, fails here — whatever the cause.
 */

const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'staff@example.com';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'devpassword12345';

/** Routes that need no business in the path. */
const GLOBAL_ROUTES = [
  '/admin',
  '/admin/businesses',
  '/admin/businesses/new',
  '/admin/create',
  '/admin/search',
  '/admin/staff',
  '/admin/account',
  '/admin/api-keys',
];

/** Routes under a single business, relative to `/admin/businesses/{id}`. */
const BUSINESS_ROUTES = [
  '',
  '/analytics',
  '/branches',
  '/brand',
  '/data',
  '/files',
  '/health',
  '/history',
  '/hours',
  '/media',
  '/menus',
  '/nutrition',
  '/offers',
  '/qr',
  '/quick',
  '/review',
  '/share',
  '/studio',
  '/template',
];

async function signIn(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

/**
 * Asserts a route renders rather than erroring.
 *
 * A 500 is the loud failure. The quiet one is a 200 carrying Next's error
 * boundary — a digest page with no content — which is what a server-action
 * boundary violation produces in development. Both are caught.
 */
async function expectRenders(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response, `${path} returned no response`).not.toBeNull();
  expect(response!.status(), `${path} returned ${response!.status()}`).toBeLessThan(400);

  const body = await page.locator('body').innerText();
  expect(body, `${path} rendered a server-error page`).not.toMatch(
    /Application error: a server-side exception|Internal Server Error|digest:/i,
  );
  // Something was actually rendered — not a blank shell.
  expect(body.trim().length, `${path} rendered an empty page`).toBeGreaterThan(0);
}

test('every global admin route renders', async ({ page }) => {
  await signIn(page);
  for (const path of GLOBAL_ROUTES) {
    await expectRenders(page, path);
  }
});

test('every per-business admin route renders', async ({ page }) => {
  await signIn(page);

  await page.goto('/admin/businesses');
  const href = await page
    .locator('a[href^="/admin/businesses/"]')
    .first()
    .getAttribute('href');
  expect(href, 'no business to walk — is the database seeded?').not.toBeNull();

  const businessId = href!.split('/')[3];
  expect(businessId).toBeTruthy();

  for (const suffix of BUSINESS_ROUTES) {
    await expectRenders(page, `/admin/businesses/${businessId}${suffix}`);
  }
});
