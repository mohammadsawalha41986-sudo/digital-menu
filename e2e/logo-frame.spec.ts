import { expect, test } from '@playwright/test';

/**
 * The logo in the menu's header sits in a frame of the logo's own shape: no empty
 * bands around a wide logo, and no stretching. The Sabah demo logo has no size
 * recorded, so its shape is read from the image itself once it loads.
 */
test('the header logo frame has the logo’s own shape', async ({ page }) => {
  await page.goto('/m/SBH001?lang=ar');

  const frame = page.locator('[data-logo-frame]');
  await expect(frame).toBeVisible();
  const img = frame.locator('img');
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);

  const natural = await img.evaluate((el: HTMLImageElement) => el.naturalWidth / el.naturalHeight);
  const box = await frame.boundingBox();
  expect(box).not.toBeNull();
  const ratio = box!.width / box!.height;

  // A wide logo gets a wide frame, matching its own proportions within 5%.
  expect(natural).toBeGreaterThan(1.3);
  expect(Math.abs(ratio - natural) / natural).toBeLessThan(0.05);
});
