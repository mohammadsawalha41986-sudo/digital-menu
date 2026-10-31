import { expect, test, type Page } from '@playwright/test';

/**
 * The menu can be installed as an app: a manifest with the restaurant's own
 * identity, a service worker that never caches, and an offer on the page that
 * a visitor can dismiss once.
 *
 * A headless browser does not raise the real install event, so the test raises
 * one itself; the page's own behaviour is what is under test.
 */

async function raiseInstallEvent(page: Page) {
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    event.prompt = async () => undefined;
    event.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(event);
  });
}

test('the menu has a manifest, a service worker, and an install offer that can be dismissed', async ({ page, request }) => {
  const manifest = await request.get('/m/SBH001/manifest.webmanifest');
  expect(manifest.status()).toBe(200);
  expect(manifest.headers()['content-type']).toContain('manifest');
  const json = await manifest.json();
  expect(json).toMatchObject({ start_url: '/m/SBH001', scope: '/m/SBH001', display: 'standalone' });
  expect(json.name.length).toBeGreaterThan(0);
  expect(json.icons.length).toBeGreaterThan(0);

  // A menu that does not exist has no manifest, so it cannot be installed.
  expect((await request.get('/m/ZZZZZZ/manifest.webmanifest')).status()).toBe(404);

  await page.goto('/m/SBH001?lang=ar');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/m/SBH001/manifest.webmanifest');
  expect((await request.get('/sw.js')).status()).toBe(200);

  // The worker registers itself on the menu page; the offer comes after that.
  await expect
    .poll(() => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration())))
    .toBe(true);

  await raiseInstallEvent(page);
  const prompt = page.locator('[data-install-prompt="install"]');
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: /Later/ }).click();
  await expect(prompt).toHaveCount(0);

  // Dismissed once, it is not asked again on this device.
  await page.reload();
  await expect
    .poll(() => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration())))
    .toBe(true);
  await raiseInstallEvent(page);
  await expect(page.locator('[data-install-prompt]')).toHaveCount(0);

  await page.evaluate(() => window.localStorage.removeItem('sf-install-dismissed'));
});
