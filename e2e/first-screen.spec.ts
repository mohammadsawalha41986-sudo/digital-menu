import { expect, test } from '@playwright/test';

/**
 * The menu's first screen stays compact: the banner follows the screen height
 * on a tablet or desktop, and on a phone the space between the banner photo
 * and the first dish is tight, without dropping anything the restaurant set up.
 *
 * Seeded fixture: `/m/SBH001`, Sabah El Lail, with a phone number and a
 * WhatsApp number, so all four quick actions under the phone banner show.
 */

const SABAH = '/m/SBH001';

test.beforeEach(async ({ page }) => {
  // The welcome overlay would cover the first screen.
  await page.addInitScript(() => sessionStorage.setItem('sf-welcome:SBH001', '1'));
});

/** Desktop and laptop screens: the banner leaves room for the menu below it. */
for (const { width, height, maxHero } of [
  { width: 1280, height: 800, maxHero: 0.72 * 800 },
  { width: 1440, height: 900, maxHero: 0.72 * 900 },
  { width: 1920, height: 1080, maxHero: 700 },
]) {
  test.describe(`desktop ${width}x${height}`, () => {
    test.use({
      viewport: { width, height },
      isMobile: false,
      hasTouch: false,
      deviceScaleFactor: 1,
      contextOptions: { reducedMotion: 'reduce' },
    });

    test(`the banner is at most ${Math.round(maxHero)}px tall`, async ({ page }) => {
      await page.goto(`${SABAH}?lang=ar`);
      const hero = page.locator('#hero');
      await expect(hero).toBeVisible();
      const box = await hero.boundingBox();
      expect(box?.height ?? Infinity).toBeLessThanOrEqual(maxHero);
    });
  });
}

test.describe('phone 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, contextOptions: { reducedMotion: 'reduce' } });

  test('every quick action stays, as one row of full-size touch targets', async ({ page }) => {
    await page.goto(`${SABAH}?lang=ar`);
    const quick = page.getByRole('navigation', { name: 'تواصل سريع' });
    // The four actions the menu offered before the first screen was compacted.
    const actions = quick.locator('a, button');
    await expect(actions).toHaveCount(4);
    const names = ['اتصال', 'واتساب', 'الموقع', 'السعرات'];
    for (const [index, name] of names.entries()) {
      await expect(actions.nth(index)).toHaveAccessibleName(name);
      await expect(actions.nth(index)).toBeVisible();
    }
    await expect(quick.getByRole('link', { name: 'اتصال' })).toHaveAttribute('href', /^tel:/);
    await expect(quick.getByRole('link', { name: 'واتساب' })).toHaveAttribute('href', /^https:\/\/wa\.me\//);
    await expect(quick.getByRole('link', { name: 'الموقع' })).toHaveAttribute('href', '#google-location');
    await expect(quick.getByRole('button', { name: 'السعرات' })).toBeVisible();

    const boxes = await actions.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), height: Math.round(r.height) };
      }),
    );
    for (const box of boxes) expect(box.height).toBeGreaterThanOrEqual(44);
    // One row at this width; if they ever wrap, every row is the same height.
    expect(new Set(boxes.map((box) => box.top)).size).toBe(1);
    expect(new Set(boxes.map((box) => box.height)).size).toBe(1);
  });

  test('the first dish starts at least 120px higher than before', async ({ page }) => {
    await page.goto(`${SABAH}?lang=ar`);
    const firstDish = page.locator('#menu-items-container [data-item]').first();
    await expect(firstDish).toBeVisible();
    const top = await firstDish.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    // Before: 1145px down the page at this size; the compact first screen
    // must bring it at least 120px higher.
    expect(top).toBeLessThanOrEqual(1145 - 120);
  });
});
