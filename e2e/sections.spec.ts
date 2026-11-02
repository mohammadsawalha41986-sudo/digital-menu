import { expect, test, type Page } from '@playwright/test';
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
