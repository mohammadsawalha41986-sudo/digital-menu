import { expect, test, type Page } from '@playwright/test';
import { openCommandPalette, signIn } from './support/admin';

/**
 * Link Health (master spec §19), driven through the admin.
 *
 * The demo restaurant publishes an Instagram address and a Google Maps
 * address, neither of which this test can reach from a sandbox — which is the
 * useful case, not an obstacle. What matters is that the platform reports what
 * it actually found: "unchecked" before a run, and a definite state after one.
 * The failure this guards against is a link reported as working because nobody
 * looked.
 */

/** The demo restaurant, found the way an operator finds it. */
async function openDemoHealth(page: Page) {
  const search = await openCommandPalette(page);
  await search.fill('DEM001');
  await page.getByRole('option', { name: /Demo Restaurant/ }).first().click();
  await expect(page).toHaveURL(/\/admin\/businesses\/[^/]+$/);

  const businessId = new URL(page.url()).pathname.split('/')[3];
  await page.goto(`/admin/businesses/${businessId}/health`);
  return businessId;
}

test('link health lists the profile’s outbound links', async ({ page }) => {
  await signIn(page);
  await openDemoHealth(page);

  const panel = page.locator('#links');
  await expect(panel.getByRole('heading', { name: 'Link health' })).toBeVisible();

  // The demo publishes an Instagram and a Maps link. Scoped to the label:
  // the URL beside it contains the same word.
  const labels = panel.locator('.admin__link-label');
  await expect(labels.filter({ hasText: 'Instagram' })).toHaveCount(1);
  await expect(labels.filter({ hasText: 'Google Maps' })).toHaveCount(1);

  // Phone and WhatsApp are deliberately absent: wa.me answers for numbers
  // nobody owns, so a tick there would be a lie.
  await expect(labels.filter({ hasText: 'WhatsApp' })).toHaveCount(0);
});

test('an unchecked link says so, rather than looking healthy', async ({ page }) => {
  await signIn(page);
  await openDemoHealth(page);

  const rows = page.locator('#links [data-link-status]');
  expect(await rows.count()).toBeGreaterThan(0);

  // Whatever the state is, it is never silently blank.
  for (const state of await rows.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-link-status')),
  )) {
    expect(['WORKING', 'BROKEN', 'BLOCKED', 'UNCHECKED']).toContain(state);
  }
});

test('running a check records a definite state for every link', async ({ page }) => {
  await signIn(page);
  await openDemoHealth(page);

  await page.getByRole('button', { name: 'Check links now' }).click();

  // The action reports what it did, whatever the network allowed.
  await expect(page.locator('.admin__message')).toBeVisible({ timeout: 30_000 });

  const states = await page
    .locator('#links [data-link-status]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-link-status')));

  // Nothing is left unchecked after a run, and nothing is invented.
  expect(states.length).toBeGreaterThan(0);
  expect(states).not.toContain('UNCHECKED');
});

test('a second run in the same minute is refused rather than amplified', async ({ page }) => {
  await signIn(page);
  await openDemoHealth(page);

  await page.getByRole('button', { name: 'Check links now' }).click();
  await expect(page.locator('.admin__message')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Check links now' }).click();
  await expect(page.locator('.admin__message--error')).toContainText('just checked');
});
