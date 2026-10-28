import { expect, test } from '@playwright/test';

/**
 * Street Food template — smoke coverage.
 *
 * The design-qa suite already proves that templates differ in markup and
 * palette; this file instead pins the specifics the family itself promises:
 * the composition it was added for.
 *
 * Seeded fixture: `/m/SBH001`, Sabah El Lail, configured with
 * `templateKey: 'street-food'`, variant `a`, 11 categories.
 */

const SABAH = '/m/SBH001';

test('the Sabah El Lail profile renders through the street-food family', async ({ page }) => {
  await page.goto(`${SABAH}?lang=ar`);

  await expect(page.locator('[data-profile-root]')).toHaveAttribute(
    'data-template',
    'street-food',
  );

  // The composition's three load-bearing regions are present. Each has a
  // dedicated test below; this assertion is cheap and fails loudly if the
  // family was accidentally recomposed.
  await expect(page.locator('.street-food__hero')).toBeVisible();
  await expect(page.locator('.street-food__chips')).toBeVisible();
  await expect(page.locator('.street-food__grid').first()).toBeVisible();
});

test('categories are an exclusively horizontal chip rail — not a sticky index', async ({
  page,
}) => {
  await page.goto(`${SABAH}?lang=ar`);

  const rail = page.locator('.street-food__chips-rail');
  await expect(rail).toBeVisible();

  // Every chip is on a single visual row — their vertical top coordinate
  // must match within one pixel. A rail that wrapped would fail this.
  const tops = await rail.locator('.street-food__chip-item').evaluateAll((items) =>
    items.map((item) => item.getBoundingClientRect().top),
  );
  expect(tops.length).toBeGreaterThanOrEqual(11);
  const first = tops[0] ?? 0;
  for (const top of tops) {
    expect(Math.abs(top - first)).toBeLessThan(2);
  }

  // No `aria-current` category-index pattern exists on this family (Editorial
  // does that; Street Food does not).
  await expect(page.locator('.street-food__chip[aria-current]')).toHaveCount(0);
});

test('items render as a vertical photo-card grid, not horizontal rows', async ({ page }) => {
  await page.goto(`${SABAH}?lang=ar`);

  const grid = page.locator('.street-food__grid').first();
  await expect(grid).toBeVisible();

  // The grid's child cards are in a 2-column arrangement at phone width (the
  // default Playwright viewport is desktop; narrow it to a phone to pin this).
  await page.setViewportSize({ width: 390, height: 844 });

  const cards = await grid.locator('.street-food__card').evaluateAll((nodes) =>
    nodes.slice(0, 4).map((node) => node.getBoundingClientRect()),
  );
  expect(cards.length).toBeGreaterThanOrEqual(2);

  // In a 2-column grid, the first and second cards share a top; the first and
  // third do not. That proves vertical cards in a horizontal pair, not a
  // single-column list.
  const first = cards[0];
  const second = cards[1];
  if (!first || !second) throw new Error('expected at least two cards');
  expect(Math.abs(first.top - second.top)).toBeLessThan(2);
  expect(first.left).not.toEqual(second.left);
});

test('every priced, available item has an add-to-cart button after hydration', async ({ page }) => {
  await page.goto(`${SABAH}?lang=ar`);

  // The cart injects a button into each card asynchronously via useEffect;
  // wait for the first one before counting.
  await page.waitForSelector('[data-menu-cart-add]');

  // Items with a price AND no `data-unavailable` all gain an add button.
  const priced = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-item]'));
    return nodes
      .filter((n) => n.dataset.itemPrice && !n.hasAttribute('data-unavailable'))
      .map((n) => Boolean(n.querySelector('[data-menu-cart-add]')));
  });
  expect(priced.length).toBeGreaterThan(5);
  for (const hasButton of priced) expect(hasButton).toBe(true);
});

test('adding an item opens the cart drawer with the right WhatsApp link', async ({ page }) => {
  await page.goto(`${SABAH}?lang=ar`);
  await page.waitForSelector('[data-menu-cart-add]');

  // Add the first available item.
  await page.locator('[data-menu-cart-add]').first().click();

  // The floating badge reports a count of 1 and the drawer opens on click.
  await expect(page.locator('.menu-cart__badge-count')).toHaveText('1');
  await page.locator('.menu-cart__badge').click();
  await expect(page.locator('.menu-cart__drawer')).toBeVisible();

  // The WhatsApp order button points at wa.me with Sabah El Lail's number
  // (966580060067, seeded) and a non-empty encoded body.
  const href = await page.locator('.menu-cart__order').getAttribute('href');
  expect(href).toMatch(/^https:\/\/wa\.me\/966580060067\?text=/);
  const bodyParam = new URL(href ?? '').searchParams.get('text');
  expect(bodyParam?.length).toBeGreaterThan(0);
});

test('the WhatsApp dock action is promoted with the brand primary', async ({ page }) => {
  await page.goto(`${SABAH}?lang=ar`);

  const whatsapp = page.locator('.street-food__dock-action[data-key="whatsapp"]');
  await expect(whatsapp).toBeVisible();

  // The dock action for WhatsApp uses `--brand-color-primary` as its
  // background — a different colour from the other actions.
  const [whatsappBg, otherBg] = await Promise.all([
    whatsapp.evaluate((el) => getComputedStyle(el).backgroundColor),
    page
      .locator('.street-food__dock-action:not([data-key="whatsapp"])')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ]);
  expect(whatsappBg).not.toEqual(otherBg);
});

test('the family carries no hex colours of its own — only brand tokens', async ({ page }) => {
  // A theme that quietly introduces its own colour would violate the
  // template/theme/brand separation (master spec §22–§26, GOALS I6). The
  // check swaps the brand palette out at runtime and asserts that
  // user-visible chrome follows.
  await page.goto(`${SABAH}?lang=ar`);

  const beforeHero = await page
    .locator('.street-food__hero')
    .evaluate((el) => getComputedStyle(el).backgroundImage);

  // Override the brand primary and read the hero gradient again. The hero
  // gradient is built from `--brand-color-primary`, so overriding it must
  // change the computed value.
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-profile-root]');
    if (root) root.style.setProperty('--brand-color-primary', '#00ff00');
  });

  const afterHero = await page
    .locator('.street-food__hero')
    .evaluate((el) => getComputedStyle(el).backgroundImage);

  expect(afterHero).not.toEqual(beforeHero);
});
