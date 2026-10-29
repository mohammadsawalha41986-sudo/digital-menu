import { expect, test } from '@playwright/test';

/**
 * DESIGN QA — one menu design, every restaurant.
 *
 * The platform ships a single design; restaurants differ by brand (colours
 * from the logo, fonts) and photo layout. So the checks here are that every
 * demo actually renders that design, in both writing directions, at every
 * target width, without pushing the page sideways.
 */

const DEMOS = ['DEM001', 'DEM003', 'DEM004', 'DEM005', 'DEM006', 'DEM007', 'SBH001'] as const;

test('every demo renders the one menu design', async ({ page }) => {
  for (const publicId of DEMOS) {
    await page.goto(`/m/${publicId}?lang=ar`);
    await expect(page.locator('[data-profile-root]'), publicId).toHaveAttribute(
      'data-template',
      'street-food',
    );
  }
});

test('every demo renders natively in both directions with no overflow', async ({ page }) => {
  for (const publicId of DEMOS) {
    for (const [lang, direction] of [
      ['ar', 'rtl'],
      ['en', 'ltr'],
    ] as const) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/m/${publicId}?lang=${lang}`);

      const root = page.locator('[data-profile-root]');
      await expect(root, `${publicId} ${lang}`).toHaveCSS('direction', direction);

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflows, `${publicId} ${lang} overflow`).toBe(false);
    }
  }
});

test('every demo is usable at every target width', async ({ page }) => {
  // master spec §139, across the whole showcase rather than one page.
  for (const publicId of DEMOS) {
    for (const width of [360, 390, 430, 768, 1200]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/m/${publicId}?lang=ar`);

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflows, `${publicId} @ ${width}px`).toBe(false);
    }
  }
});

test('two brands get two palettes from the same design', async ({ page }) => {
  const primaryOf = async (publicId: string) => {
    await page.goto(`/m/${publicId}?lang=ar`);
    return page
      .locator('[data-profile-root]')
      .evaluate((root) => getComputedStyle(root).getPropertyValue('--brand-color-primary').trim());
  };

  expect(await primaryOf('DEM001')).not.toBe(await primaryOf('SBH001'));
});
