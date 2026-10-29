import { expect, test } from '@playwright/test';

/**
 * The menu design — the composition every restaurant gets.
 *
 * Seeded fixture: `/m/SBH001`, Sabah El Lail (WhatsApp 966580060067), on the
 * default photo layout.
 */

const SABAH = '/m/SBH001';

test('the profile renders the hero, the category rail and the dishes', async ({ page }) => {
  await page.goto(`${SABAH}?lang=ar`);

  await expect(page.locator('[data-profile-root]')).toHaveAttribute('data-template', 'street-food');
  await expect(page.locator('#hero')).toBeVisible();
  await expect(page.locator('[data-category-rail]')).toBeVisible();
  expect(await page.locator('[data-item]').count()).toBeGreaterThan(5);

  // The restaurant's name is the page's one h1, not a rotating dish slide.
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('مطعم صباح الليل');
});

test('categories are a single horizontal row', async ({ page }) => {
  await page.goto(`${SABAH}?lang=ar`);

  const tops = await page
    .locator('[data-category-rail] > button')
    .evaluateAll((chips) => chips.map((chip) => chip.getBoundingClientRect().top));

  expect(tops.length).toBeGreaterThanOrEqual(5);
  for (const top of tops) expect(Math.abs(top - (tops[0] ?? 0))).toBeLessThan(2);
});

test('photo cards sit two-up on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${SABAH}?lang=ar`);

  const cards = page.locator('#menu-items-container [data-item]');
  await cards.nth(1).scrollIntoViewIfNeeded();
  // Cards slide up as they enter; measure once both have settled.
  await expect
    .poll(async () => {
      const [first, second] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()]);
      if (!first || !second) return 'missing';
      return Math.abs(first.y - second.y) < 2 && first.x !== second.x ? 'two-up' : 'not yet';
    })
    .toBe('two-up');
});

test('an order goes to the restaurant’s own WhatsApp number', async ({ page }) => {
  await page.goto(`${SABAH}?lang=ar`);

  const card = page.locator('#menu-items-container [data-item]').first();
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button').last().click();
  // Adding opens the cart drawer on its own.
  await page.getByRole('button', { name: /إضافة إلى الطلب/ }).click();

  // Record the address the page asks to open rather than loading WhatsApp.
  await page.evaluate(() => {
    window.open = ((url: string) => {
      (window as unknown as { openedUrl: string }).openedUrl = url;
      return null;
    }) as typeof window.open;
  });
  await page.getByRole('button', { name: /إرسال الطلب عبر واتساب/ }).click();

  const opened = await page.evaluate(() => (window as unknown as { openedUrl?: string }).openedUrl ?? '');
  expect(opened).toMatch(/^https:\/\/wa\.me\/966580060067\?text=.+/);
});

test('the design takes its colours from the brand, not from itself', async ({ page }) => {
  await page.goto(`${SABAH}?lang=ar`);

  const addButton = page.locator('#menu-items-container [data-item]').first().getByRole('button').last();
  const before = await addButton.evaluate((el) => getComputedStyle(el).backgroundImage);

  await page.evaluate(() => {
    document
      .querySelector<HTMLElement>('[data-profile-root]')
      ?.style.setProperty('--brand-color-primary', '#ff00ff');
  });

  const after = await addButton.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(after).not.toEqual(before);
});
