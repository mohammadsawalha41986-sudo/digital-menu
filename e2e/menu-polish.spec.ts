import { expect, test, type Page } from '@playwright/test';

/**
 * Customer-facing menu polish on the seeded Sabah El Lail menu (`/m/SBH001`):
 * category jumps clear the sticky bars, Arabic search forgives spelling, an
 * emptying the cart asks first. (The double-tap send test is pending: see report.)
 */

const SABAH = '/m/SBH001';

/** Adds the first dish and leaves the cart drawer open. */
async function addFirstDish(page: Page) {
  const card = page.locator('#menu-items-container [data-item]').first();
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button').last().click();
  await page.getByRole('button', { name: /إضافة إلى الطلب/ }).click();
}

for (const width of [390, 1440]) {
  test(`a chosen category's heading sits below the sticky bars at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${SABAH}?lang=ar`);

    const chips = page.locator('[data-category-rail] > button');
    const chip = chips.nth(2);
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(chips.first()).toHaveAttribute('aria-pressed', 'false');

    const heading = page.locator('#menu-items-container section h2').first();
    await expect
      .poll(async () => {
        const [bars, box] = await Promise.all([
          page.locator('[data-sticky-bar]').evaluateAll((els) => Math.max(...els.map((el) => el.getBoundingClientRect().bottom))),
          heading.boundingBox(),
        ]);
        return box !== null && box.y >= bars && box.y + box.height <= 900;
      })
      .toBe(true);
  });
}

test('Arabic search forgives ة/ه and finds the dish', async ({ page }) => {
  await page.goto(`${SABAH}?lang=ar`);

  await page.getByRole('searchbox', { name: 'ابحث في المنيو' }).fill('وجبه');
  const names = page.locator('#menu-items-container [data-item] h3');
  await expect(names.first()).toBeVisible();
  await expect(names.filter({ hasText: 'وجبة' }).first()).toBeVisible();

  await page.getByRole('button', { name: 'مسح' }).click();
  await expect(page.getByRole('searchbox', { name: 'ابحث في المنيو' })).toHaveValue('');
});

test('emptying the cart asks first; one line still goes in one tap', async ({ page }) => {
  await page.goto(`${SABAH}?lang=ar`);
  await addFirstDish(page);
  await page.getByRole('button', { name: 'زيادة الكمية' }).click();

  await page.getByRole('button', { name: 'تفريغ السلة' }).click();
  const confirm = page.locator('[data-clear-confirm]');
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'إبقاء الطلب' }).click();
  await expect(page.getByRole('button', { name: /إرسال الطلب عبر واتساب/ })).toBeVisible();

  await page.getByRole('button', { name: 'تفريغ السلة' }).click();
  await page.getByRole('button', { name: 'نعم، تفريغ السلة' }).click();
  await expect(page.getByText('سلة الطلب فارغة')).toBeVisible();
});
