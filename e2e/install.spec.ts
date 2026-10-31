import { devices, expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * Installing a menu as an app: the manifest and icons it offers, when the
 * offer appears, where it sits, and what a visitor can do with it.
 *
 * A headless browser never raises the real install event, so these tests raise
 * one with the fields the browser would give; the page's own behaviour is what
 * is under test. Nothing here proves a real device installs the app.
 */

const RESTAURANT = 'SBH001';
const OTHER_RESTAURANT = 'DEM001';
/** The offer appears this long after the first real step (SETTLE_MS in the component). */
const AFTER_SETTLE = 2500;

const DESKTOP_UA = devices['Desktop Chrome'].userAgent;
const IPHONE = devices['iPhone 13'];

async function openMenu(page: Page, path: string) {
  await page.goto(path);
  // The menu marks the page once its install listeners are attached. Until
  // then a browser event would be missed. (A service worker registered by an
  // earlier page of this site would not tell us that.)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.installReady === 'true'))
    .toBe(true);
}

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

async function openFirstDish(page: Page) {
  await page.locator('#menu-items-container [data-item]').first().getByRole('button').last().click();
  await expect(page.getByRole('button', { name: /إضافة إلى الطلب|Add to Order/ })).toBeVisible();
}

/** Clicking the backdrop closes a dish sheet. */
async function closeSheet(page: Page) {
  await page.mouse.click(5, 5);
}

function box(rect: { x: number; y: number; width: number; height: number } | null) {
  if (!rect) throw new Error('element has no box');
  return rect;
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function pngSize(body: Buffer) {
  expect(body.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
}

/** Resolves once the menu has sent `eventName` and the server has accepted it (204). */
async function eventAccepted(page: Page, eventName: string) {
  const response = await page.waitForResponse(
    (res) => res.url().endsWith('/api/events') && (res.request().postData() ?? '').includes(eventName),
  );
  expect(response.status()).toBe(204);
}

test.describe('the menu as an app, on a phone', () => {
  test('the manifest and icons belong to the restaurant, and an unknown or unpublished menu has none', async ({ request }) => {
    const response = await request.get(`/m/${RESTAURANT}/manifest.webmanifest`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/manifest+json');

    const manifest = await response.json();
    expect(manifest).toMatchObject({
      id: `/m/${RESTAURANT}`,
      start_url: `/m/${RESTAURANT}`,
      scope: `/m/${RESTAURANT}`,
      display: 'standalone',
      lang: 'ar',
      dir: 'rtl',
    });
    expect(manifest.name).toBe('مطعم صباح الليل');
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(['192x192', '512x512']);

    // Each icon is a real PNG of exactly the size its manifest entry claims.
    for (const icon of manifest.icons as { src: string; sizes: string; type: string }[]) {
      expect(icon.type).toBe('image/png');
      const image = await request.get(icon.src);
      expect(image.status()).toBe(200);
      expect(image.headers()['content-type']).toBe('image/png');
      const { width, height } = pngSize(await image.body());
      expect(`${width}x${height}`).toBe(icon.sizes);
    }

    // A size this app does not offer, a menu that is not live, and an unknown menu: all refused.
    expect((await request.get(`/m/${RESTAURANT}/app-icon/100.png`)).status()).toBe(404);
    expect((await request.get('/m/DRAFT1/manifest.webmanifest')).status()).toBe(404);
    expect((await request.get('/m/DRAFT1/app-icon/192.png')).status()).toBe(404);
    expect((await request.get('/m/ZZZZZZ/manifest.webmanifest')).status()).toBe(404);
  });

  test('the offer does not appear on a first look, however long the visitor stays', async ({ page }) => {
    await openMenu(page, `/m/${RESTAURANT}?lang=ar`);
    await raiseInstallEvent(page);
    await page.waitForTimeout(AFTER_SETTLE);
    await expect(page.locator('[data-install-prompt]')).toHaveCount(0);
  });

  test('after a dish is opened, the offer waits behind the sheet, then sits above the order bar', async ({ page }) => {
    await openMenu(page, `/m/${RESTAURANT}?lang=ar`);
    await raiseInstallEvent(page);
    await openFirstDish(page);

    // Hidden while the dish sheet is open.
    await expect(page.locator('[data-install-prompt]')).toHaveCount(0);

    const shown = eventAccepted(page, 'install_prompt_shown');
    await closeSheet(page);
    const prompt = page.locator('[data-install-prompt="install"]');
    await expect(prompt).toBeVisible({ timeout: 6000 });
    await shown;
    await expect(prompt).toHaveAttribute('dir', 'rtl');

    // Above the order bar, never over it or the header.
    const promptBox = box(await prompt.boundingBox());
    const dockBox = box(await page.locator('[data-dock="mobile"]').boundingBox());
    const headerBox = box(await page.locator('header').first().boundingBox());
    expect(promptBox.y + promptBox.height).toBeLessThanOrEqual(dockBox.y);
    expect(overlaps(promptBox, dockBox)).toBe(false);
    expect(overlaps(promptBox, headerBox)).toBe(false);
  });

  test('with something in the order, the offer clears the order button and hides while the cart is open', async ({ page }) => {
    await openMenu(page, `/m/${RESTAURANT}?lang=ar`);
    await raiseInstallEvent(page);
    await openFirstDish(page);
    await page.getByRole('button', { name: /إضافة إلى الطلب/ }).click();
    // Adding opens the cart; close it to reach the order bar.
    await expect(page.getByRole('button', { name: /إرسال الطلب عبر واتساب/ })).toBeVisible();
    await page.getByRole('button', { name: /إغلاق السلة/ }).click();

    const orderButton = page.getByRole('button', { name: /عرض الطلب|View Order/ });
    await expect(orderButton).toBeVisible();

    const prompt = page.locator('[data-install-prompt="install"]');
    await expect(prompt).toBeVisible({ timeout: 6000 });
    const promptBox = box(await prompt.boundingBox());
    const orderBox = box(await orderButton.boundingBox());
    const dockBox = box(await page.locator('[data-dock="mobile"]').boundingBox());
    expect(overlaps(promptBox, orderBox)).toBe(false);
    expect(overlaps(promptBox, dockBox)).toBe(false);

    // The cart covers the offer while it is open, and the offer returns when it closes.
    await orderButton.click();
    await expect(prompt).toHaveCount(0);
    await page.getByRole('button', { name: /إغلاق السلة/ }).click();
    await expect(page.locator('[data-install-prompt="install"]')).toBeVisible();
  });

  test('Later hides the offer for this restaurant, and it stays hidden on the next visit', async ({ page }) => {
    await openMenu(page, `/m/${RESTAURANT}?lang=ar`);
    await raiseInstallEvent(page);
    await openFirstDish(page);
    await closeSheet(page);

    const prompt = page.locator('[data-install-prompt="install"]');
    await expect(prompt).toBeVisible({ timeout: 6000 });

    const dismissed = eventAccepted(page, 'install_dismissed');
    await prompt.getByRole('button', { name: /لاحقاً/ }).click();
    await dismissed;
    await expect(page.locator('[data-install-prompt]')).toHaveCount(0);

    await openMenu(page, `/m/${RESTAURANT}?lang=ar`);
    await raiseInstallEvent(page);
    await openFirstDish(page);
    await closeSheet(page);
    await page.waitForTimeout(AFTER_SETTLE);
    await expect(page.locator('[data-install-prompt]')).toHaveCount(0);
  });

  test('a choice made for one restaurant does not hide the offer on another', async ({ browser }) => {
    const context = await browser.newContext({ ...devices['Pixel 7'] });
    const page = await context.newPage();
    await openMenu(page, `/m/${RESTAURANT}?lang=ar`);
    await raiseInstallEvent(page);
    await openFirstDish(page);
    await closeSheet(page);
    await page.locator('[data-install-prompt="install"]').getByRole('button', { name: /لاحقاً/ }).click();

    await openMenu(page, `/m/${OTHER_RESTAURANT}?lang=ar`);
    await raiseInstallEvent(page);
    await openFirstDish(page);
    await closeSheet(page);
    await expect(page.locator('[data-install-prompt="install"]')).toBeVisible({ timeout: 6000 });
    await context.close();
  });

  test('a returning visitor is offered the install without taking any step', async ({ browser }) => {
    const context: BrowserContext = await browser.newContext({ ...devices['Pixel 7'] });

    // First visit: nothing is offered, and the visit is counted.
    const first = await context.newPage();
    await openMenu(first, `/m/${RESTAURANT}?lang=ar`);
    await raiseInstallEvent(first);
    await first.waitForTimeout(AFTER_SETTLE);
    await expect(first.locator('[data-install-prompt]')).toHaveCount(0);
    await first.close();

    // A new tab is a new browser session: this is a return visit.
    const second = await context.newPage();
    await openMenu(second, `/m/${RESTAURANT}?lang=ar`);
    await raiseInstallEvent(second);
    await expect(second.locator('[data-install-prompt="install"]')).toBeVisible({ timeout: 6000 });
    await context.close();
  });

  test('an English visitor gets English text, left to right', async ({ page }) => {
    await openMenu(page, `/m/${RESTAURANT}?lang=en`);
    await raiseInstallEvent(page);
    await openFirstDish(page);
    await closeSheet(page);
    const prompt = page.locator('[data-install-prompt="install"]');
    await expect(prompt).toBeVisible({ timeout: 6000 });
    await expect(prompt).toHaveAttribute('dir', 'ltr');
    await expect(prompt.getByRole('button', { name: /Install/ })).toBeVisible();
    await expect(prompt.getByRole('button', { name: /Later/ })).toBeVisible();
  });
});

test.describe('the menu as an app, on a wide screen', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, userAgent: DESKTOP_UA });

  test('the offer sits in the lower-right corner, clear of the scroll-to-top button', async ({ page }) => {
    await openMenu(page, `/m/${RESTAURANT}?lang=en`);
    await raiseInstallEvent(page);
    await openFirstDish(page);
    await closeSheet(page);

    const prompt = page.locator('[data-install-prompt="install"]');
    await expect(prompt).toBeVisible({ timeout: 6000 });
    const promptBox = box(await prompt.boundingBox());
    expect(promptBox.x + promptBox.width).toBeGreaterThan(1280 - 40);
    expect(promptBox.y + promptBox.height).toBeGreaterThan(800 - 40);

    // The scroll-to-top button appears once the page has been scrolled.
    await page.evaluate(() => window.scrollTo(0, 2000));
    const scrollTop = page.getByRole('button', { name: /Scroll to top|العودة للأعلى/ });
    await expect(scrollTop).toBeVisible();
    expect(overlaps(box(await scrollTop.boundingBox()), box(await prompt.boundingBox()))).toBe(false);
  });
});

test.describe('the menu as an app, on an iPhone', () => {
  test.use({
    userAgent: IPHONE.userAgent,
    viewport: IPHONE.viewport,
    isMobile: true,
    hasTouch: true,
  });

  test('an iPhone has no install button, so it is given the Home Screen steps', async ({ page }) => {
    await openMenu(page, `/m/${RESTAURANT}?lang=ar`);
    await openFirstDish(page);
    await closeSheet(page);

    const prompt = page.locator('[data-install-prompt="ios"]');
    await expect(prompt).toBeVisible({ timeout: 6000 });
    await expect(prompt.getByRole('button', { name: /Install/ })).toHaveCount(0);

    await prompt.getByRole('button', { name: /كيف/ }).click();
    await expect(prompt.getByText('إضافة إلى الشاشة الرئيسية')).toBeVisible();
  });
});
