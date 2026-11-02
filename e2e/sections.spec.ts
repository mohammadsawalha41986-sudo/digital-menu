import { expect, test, type Browser, type Page } from '@playwright/test';
import { signIn } from './support/admin';

/**
 * Sections from the dishes screen, the way an owner adds them: a section on
 * its own, and a dish that names a new section as it is added. Each test
 * removes what it added, so the demo restaurant is as it was.
 */

test.describe.configure({ mode: 'serial' });

async function manageHref(page: Page): Promise<string> {
  await page.goto('/admin/businesses');
  const href = await page.locator('a[href="/m/SBH001"]').first().evaluate((link) =>
    link.closest('article')?.querySelector('a[href^="/admin/businesses/"]')?.getAttribute('href') ?? '',
  );
  expect(href).toBeTruthy();
  return `${href}/manage`;
}

function sectionButton(page: Page, name: string) {
  return page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: new RegExp(name) });
}

async function deleteEmptySection(page: Page, name: string) {
  await sectionButton(page, name).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /حذف هذا القسم الفارغ/ }).click();
  await expect(page.getByRole('status')).toContainText('Section removed');
  await expect(sectionButton(page, name)).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('a section is added from the dishes screen, and an empty one can be removed', async ({ page }) => {
  test.setTimeout(120_000);
  const name = `قسم اختبار ${Date.now() % 100000}`;
  await page.goto(await manageHref(page));

  await page.getByRole('button', { name: /إضافة قسم · Add section/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add a section' });
  await dialog.getByLabel('اسم القسم بالعربي · Section name (Arabic)').fill(name);
  await dialog.getByLabel('بالإنجليزي (اختياري) · English (optional)').fill('Test section');
  await dialog.getByRole('button', { name: /إضافة القسم · Add section/ }).click();

  await expect(page.getByRole('status')).toContainText(`Added the section “${name}”`);
  await expect(sectionButton(page, name)).toBeVisible();

  await deleteEmptySection(page, name);
});

test('a dish can be added into a new section named in the same dialog', async ({ page }) => {
  test.setTimeout(120_000);
  const section = `قسم جديد ${Date.now() % 100000}`;
  const dish = `صنف اختبار ${Date.now() % 100000}`;
  await page.goto(await manageHref(page));

  await page.getByRole('button', { name: /إضافة صنف · Add dish/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add a dish' });
  await dialog.getByLabel('الاسم بالعربي · Name (Arabic)').fill(dish);
  await dialog.getByLabel('السعر · Price').fill('12');
  await dialog.getByLabel('القسم · Section').selectOption('__new');
  await dialog.getByLabel('اسم القسم الجديد · New section name').fill(section);
  await dialog.getByRole('button', { name: /^إضافة · Add$/ }).click();

  await expect(page.getByRole('status')).toContainText('Dish and section added');
  await expect(sectionButton(page, section)).toBeVisible();
  // The editor opens on the new dish; close it to get back to the list.
  const editor = page.getByRole('dialog', { name: /Edit/ });
  if (await editor.isVisible()) await editor.getByRole('button', { name: 'Close' }).click();

  const row = page.locator('[data-dish-row]', { hasText: dish }).first();
  await expect(row).toBeVisible();

  // Remove the dish, then the section it left empty.
  await row.getByRole('checkbox').check();
  await page.getByRole('region', { name: 'Selected dishes' }).getByRole('button', { name: /^حذف · Delete$/ }).click();
  await page.getByRole('dialog', { name: 'Confirm delete' }).getByRole('button', { name: /^حذف · Delete$/ }).click();
  await expect(page.locator('[data-dish-row]', { hasText: dish })).toHaveCount(0);
  await deleteEmptySection(page, section);
});

/**
 * The last two sections of one menu, by key and name. The tests below arrange
 * and hide these, not the first ones, because other suites read the menu's
 * first dish while they run.
 */
async function lastTwoSections(page: Page) {
  const rows = page.locator('[data-drop-section]');
  const all = await rows.evaluateAll((elements) =>
    elements.map((element) => ({
      key: element.getAttribute('data-drop-section') ?? '',
      menu: element.getAttribute('data-section-menu') ?? '',
    })),
  );
  const menu = all[all.length - 1]!.menu;
  const inMenu = all.filter((section) => section.menu === menu);
  expect(inMenu.length).toBeGreaterThan(1);
  return { last: inMenu[inMenu.length - 1]!.key, beforeLast: inMenu[inMenu.length - 2]!.key };
}

async function sectionName(page: Page, key: string): Promise<string> {
  return (await page.locator(`[data-section-row="${key}"]`).getAttribute('data-section-name')) ?? '';
}

async function arrangeOrder(page: Page): Promise<string[]> {
  return page.locator('[data-section-row]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-section-row') ?? ''));
}

/** A dish in the section that is on the public menu now. */
async function shownDishIn(page: Page, key: string): Promise<string> {
  await page.locator(`[data-drop-section="${key}"]`).click();
  const row = page.locator('[data-dish-row]').filter({ has: page.locator('.mg__eye[data-hidden="false"]') }).first();
  const code = await row.getAttribute('data-dish-row');
  expect(code).toBeTruthy();
  return code!;
}

async function publicMenu(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/m/SBH001?lang=ar');
  return { context, page };
}

test('sections can be put in a new order, and the order is kept after a reload', async ({ page }) => {
  test.setTimeout(120_000);
  const url = await manageHref(page);
  await page.goto(url);
  const { last, beforeLast } = await lastTwoSections(page);

  await page.getByRole('button', { name: /ترتيب وإظهار الأقسام/ }).click();
  const name = await sectionName(page, last);
  await page.getByRole('button', { name: `Move ${name} up`, exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Section order saved');

  await page.reload();
  await page.getByRole('button', { name: /ترتيب وإظهار الأقسام/ }).click();
  const order = await arrangeOrder(page);
  expect(order.indexOf(last)).toBe(order.indexOf(beforeLast) - 1);

  // Put it back.
  await page.getByRole('button', { name: `Move ${name} down`, exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Section order saved');
  const restored = await arrangeOrder(page);
  expect(restored.indexOf(last)).toBe(restored.indexOf(beforeLast) + 1);
});

test('a hidden section leaves the public menu with its dishes, and comes back when shown', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await page.goto(await manageHref(page));
  const { last } = await lastTwoSections(page);
  const code = await shownDishIn(page, last);

  await page.getByRole('button', { name: /ترتيب وإظهار الأقسام/ }).click();
  const name = await sectionName(page, last);
  const visitor = await publicMenu(browser);
  try {
    await page.getByRole('button', { name: `Hide ${name}`, exact: true }).click();
    await expect(page.getByRole('status')).toContainText('مخفي من المنيو');
    await visitor.page.reload();
    await expect(visitor.page.locator(`#menu-items-container [data-item="${code}"]`)).toHaveCount(0);
  } finally {
    await page.getByRole('button', { name: `Show ${name}`, exact: true }).click();
    await expect(page.getByRole('status')).toContainText('ظاهر الآن');
  }
  await visitor.page.reload();
  await expect(visitor.page.locator(`#menu-items-container [data-item="${code}"]`)).toHaveCount(1);
  await visitor.context.close();
});

test('a dish is hidden and shown again with one button', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await page.goto(await manageHref(page));
  const { last } = await lastTwoSections(page);
  const code = await shownDishIn(page, last);
  const row = page.locator(`[data-dish-row="${code}"]`).first();
  const visitor = await publicMenu(browser);
  try {
    await row.getByRole('button', { name: 'إخفاء · Hide' }).click();
    await expect(row.getByRole('button', { name: 'إظهار · Show' })).toBeVisible();
    await visitor.page.reload();
    await expect(visitor.page.locator(`#menu-items-container [data-item="${code}"]`)).toHaveCount(0);
  } finally {
    await row.getByRole('button', { name: 'إظهار · Show' }).click();
    await expect(row.getByRole('button', { name: 'إخفاء · Hide' })).toBeVisible();
  }
  await visitor.page.reload();
  await expect(visitor.page.locator(`#menu-items-container [data-item="${code}"]`)).toHaveCount(1);
  await visitor.context.close();
});

test('a dish dragged onto another section moves there, and can be dragged back', async ({ browser }) => {
  test.setTimeout(120_000);
  // Dragging is a mouse gesture: a laptop-sized window.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await signIn(page);
    await page.goto(await manageHref(page));
    const { last, beforeLast } = await lastTwoSections(page);
    const code = await shownDishIn(page, last);

    await page.locator(`[data-dish-row="${code}"] .mg__code`).first().dragTo(page.locator(`[data-drop-section="${beforeLast}"]`));
    await expect(page.getByRole('status')).toContainText('Moved');
    await page.locator(`[data-drop-section="${beforeLast}"]`).click();
    await expect(page.locator(`[data-dish-row="${code}"]`)).toHaveCount(1);

    // And back where it was.
    await page.locator(`[data-dish-row="${code}"] .mg__code`).first().dragTo(page.locator(`[data-drop-section="${last}"]`));
    await expect(page.getByRole('status')).toContainText('Moved');
    await page.locator(`[data-drop-section="${last}"]`).click();
    await expect(page.locator(`[data-dish-row="${code}"]`)).toHaveCount(1);
  } finally {
    await context.close();
  }
});
