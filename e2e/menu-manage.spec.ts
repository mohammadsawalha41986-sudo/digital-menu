import { expect, test, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { signIn } from './support/admin';

/**
 * The menu and dishes screen, used the way an owner uses it: the editor opens
 * beside the list, an edit saves by itself and reaches the public menu, a
 * change made elsewhere is not overwritten, a save that fails can be retried,
 * and deleting is always confirmed and can be undone.
 *
 * The demo restaurant is changed during these tests and put back afterwards.
 */

const DISH = 'SHW-001';

/**
 * The dish's own English name, without the suffixes an earlier run may have left
 * behind when it stopped before its restore step. Starting from the base name
 * means a failed run can never make the next one start from a longer name.
 */
function baseName(value: string): string {
  return value.replace(/( \((other|mine)\)| E2E| retry)+$/u, '').trim();
}

async function manageHref(page: Page): Promise<string> {
  await page.goto('/admin/businesses');
  const href = await page.locator('a[href="/m/SBH001"]').first().evaluate((link) =>
    link.closest('article')?.querySelector('a[href^="/admin/businesses/"]')?.getAttribute('href') ?? '',
  );
  expect(href).toBeTruthy();
  return `${href}/manage`;
}

function dishRow(page: Page) {
  return page.locator(`[data-dish-row="${DISH}"]`).first();
}

async function openEditor(page: Page) {
  await dishRow(page).getByRole('button', { name: /تعديل · Edit/ }).first().click();
  await expect(page.getByRole('dialog', { name: /Edit/ })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('the editor opens beside the list, inside the screen, without going to the bottom of the page', async ({ page }) => {
  test.skip(test.info().project.name.includes('mobile'), 'Desktop layout: the editor sits beside the list.');
  await page.goto(await manageHref(page));
  await dishRow(page).scrollIntoViewIfNeeded();
  await openEditor(page);
  const box = await page.locator('.mg__drawer').boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
  await expect(page.getByLabel('الاسم بالعربي · Name (Arabic)')).toBeVisible();
});

test('an edit saves by itself, shows on the public menu, and is put back afterwards', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await page.goto(await manageHref(page));
  await openEditor(page);

  const original = baseName(await page.getByLabel('الاسم بالإنجليزي · Name (English)').inputValue());
  const renamed = `${original} E2E`;
  try {
    await page.getByLabel('الاسم بالإنجليزي · Name (English)').fill(renamed);
    await expect(page.locator('.mg__drawer-status')).toContainText('Saved');

    const visitor = await browser.newContext();
    const menuPage = await visitor.newPage();
    await menuPage.goto('/m/SBH001?lang=en');
    await expect(menuPage.locator(`#menu-items-container [data-item="${DISH}"]`)).toContainText(renamed);
    await visitor.close();
  } finally {
    await page.getByLabel('الاسم بالإنجليزي · Name (English)').fill(original);
    await expect(page.locator('.mg__drawer-status')).toContainText('Saved');
  }
});

test('a change made elsewhere is not overwritten: the screen shows it and asks what to do', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const url = await manageHref(page);
  await page.goto(url);
  await openEditor(page);
  const original = baseName(await page.getByLabel('الاسم بالإنجليزي · Name (English)').inputValue());

  // A second screen changes the same dish first.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage);
  await otherPage.goto(url);
  await otherPage.locator(`[data-dish-row="${DISH}"]`).first().getByRole('button', { name: /تعديل · Edit/ }).first().click();
  await expect(otherPage.getByRole('dialog', { name: /Edit/ })).toBeVisible();
  const theirs = `${original} (other)`;
  await otherPage.getByLabel('الاسم بالإنجليزي · Name (English)').fill(theirs);
  await expect(otherPage.locator('.mg__drawer-status')).toContainText('Saved');

  try {
    // This screen still shows the old version, so its edit must not overwrite the other one.
    await page.getByLabel('الاسم بالإنجليزي · Name (English)').fill(`${original} (mine)`);
    await expect(page.locator('.mg__conflict-box')).toBeVisible();
    // The editor's own button: the table row has a second one for the same dish.
    await page.getByRole('dialog', { name: /Edit/ }).getByRole('button', { name: /أخذ النسخة الحالية · Use theirs/ }).click({ timeout: 10000 });
    await expect(page.getByLabel('الاسم بالإنجليزي · Name (English)')).toHaveValue(theirs);
  } finally {
    // Each screen is put back even when the check before it fails, so a failed run never leaves a suffix behind.
    try {
      await page.getByLabel('الاسم بالإنجليزي · Name (English)').fill(original);
      await expect(page.locator('.mg__drawer-status')).toContainText('Saved');
    } finally {
      // Close the other screen first. A screen with an unsaved edit asks before it
      // leaves, and that prompt would cancel the navigation below.
      await other.close();
      const again = await browser.newContext();
      try {
        const fresh = await again.newPage();
        await signIn(fresh);
        await fresh.goto(url);
        await dishRow(fresh).getByRole('button', { name: /تعديل · Edit/ }).first().click();
        await expect(fresh.getByRole('dialog', { name: /Edit/ })).toBeVisible();
        // The first screen has put the name back already, so usually there is nothing left to save here.
        const freshName = fresh.getByLabel('الاسم بالإنجليزي · Name (English)');
        if ((await freshName.inputValue()) !== original) {
          await freshName.fill(original);
          await expect(fresh.locator('.mg__drawer-status')).toContainText('Saved');
        }
      } finally {
        await again.close();
      }
    }
  }
});

test('a save that fails keeps the edit on screen, and retry sends it once the server answers', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(await manageHref(page));
  await openEditor(page);
  const original = baseName(await page.getByLabel('الاسم بالإنجليزي · Name (English)').inputValue());

  // The next save requests fail as if the connection dropped.
  await page.route('**/*', async (route) => {
    const headers = route.request().headers();
    if (route.request().method() === 'POST' && headers['next-action']) {
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  try {
    await page.getByLabel('الاسم بالإنجليزي · Name (English)').fill(`${original} retry`);
    await expect(page.locator('.mg__drawer-status')).toContainText('Not saved');
    await expect(page.getByLabel('الاسم بالإنجليزي · Name (English)')).toHaveValue(`${original} retry`);
  } finally {
    await page.unroute('**/*');
  }
  await page.getByRole('dialog', { name: /Edit/ }).getByRole('button', { name: /إعادة المحاولة · Retry/ }).click();
  await expect(page.locator('.mg__drawer-status')).toContainText('Saved');

  await page.getByLabel('الاسم بالإنجليزي · Name (English)').fill(original);
  await expect(page.locator('.mg__drawer-status')).toContainText('Saved');
});

test('deleting dishes asks first, and the deletion can be restored from the list', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(await manageHref(page));
  const rows = page.locator('[data-dish-row]');
  const first = rows.nth(0);
  const second = rows.nth(1);
  const firstCode = await first.getAttribute('data-dish-row');
  const secondCode = await second.getAttribute('data-dish-row');
  expect(firstCode).toBeTruthy();
  expect(secondCode).toBeTruthy();

  await first.getByRole('checkbox').check();
  await second.getByRole('checkbox').check();
  await page.getByRole('button', { name: /^حذف · Delete$/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Confirm delete' })).toBeVisible();
  await page.getByRole('button', { name: /Cancel/ }).last().click();
  await expect(page.locator(`[data-dish-row="${firstCode}"]`).first()).toBeVisible();

  await page.getByRole('button', { name: /^حذف · Delete$/ }).first().click();
  await page.getByRole('dialog', { name: 'Confirm delete' }).getByRole('button', { name: /^حذف · Delete$/ }).click();
  await expect(page.locator(`[data-dish-row="${firstCode}"]`)).toHaveCount(0);

  await page.getByRole('button', { name: /المنيوهات والمحذوفات · Menus & deleted/ }).click();
  const restore = page.getByRole('button', { name: /استعادة · Restore/ }).first();
  await expect(restore).toBeVisible();
  await restore.click();
  await expect(page.locator(`[data-dish-row="${firstCode}"]`).first()).toBeVisible({ timeout: 15_000 });
});

test('deleting a whole menu needs its name typed exactly, and shows what goes with it', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(await manageHref(page));
  await page.getByRole('button', { name: /المنيوهات والمحذوفات · Menus & deleted/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Menus and deleted items' });
  await dialog.getByRole('button', { name: /حذف المنيو · Delete menu/ }).first().click();
  const confirm = dialog.locator('section[aria-label="Confirm menu deletion"]');
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('dishes');
  const deleteButton = confirm.getByRole('button', { name: /حذف نهائياً من المنيو · Delete menu/ });
  await expect(deleteButton).toBeDisabled();
  await confirm.getByRole('textbox').fill('not-the-name');
  await expect(deleteButton).toBeDisabled();
  await confirm.getByRole('button', { name: /إلغاء · Cancel/ }).click();
  await expect(confirm).toHaveCount(0);
});

const AVAILABILITY_TOGGLE = /متوفر · Available|غير متوفر · Out|مخفي · Hidden|موسمي · Seasonal/;

async function dataHref(page: Page): Promise<string> {
  return (await manageHref(page)).replace(/\/manage$/, '/data');
}

test('a copy lands in a section as a hidden copy, and can be removed again', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(await manageHref(page));
  const rows = page.locator('[data-dish-row]');
  const before = await rows.count();

  await dishRow(page).getByRole('checkbox').check();
  const bulk = page.getByRole('region', { name: 'Selected dishes' });
  await bulk.locator('select').selectOption({ index: 1 });
  await bulk.getByRole('button', { name: /نسخ · Copy/ }).click();
  await expect(rows).toHaveCount(before + 1);

  // Remove the copy again, so the restaurant is as it was.
  const copy = page.locator('[data-dish-row*="COPY"]').first();
  await expect(copy).toBeVisible();
  await copy.getByRole('checkbox').check();
  await page.getByRole('region', { name: 'Selected dishes' }).getByRole('button', { name: /^حذف · Delete$/ }).click();
  await page.getByRole('dialog', { name: 'Confirm delete' }).getByRole('button', { name: /^حذف · Delete$/ }).click();
  await expect(rows).toHaveCount(before);
});

test('the availability toggle turns a dish off and on with one click, and the change survives a reload', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(await manageHref(page));
  const toggle = () => dishRow(page).getByRole('button', { name: AVAILABILITY_TOGGLE }).first();
  const wasOn = (await toggle().getAttribute('aria-pressed')) === 'true';

  try {
    await toggle().click();
    await expect(toggle()).toHaveAttribute('aria-pressed', wasOn ? 'false' : 'true');
    await page.reload();
    await expect(toggle()).toHaveAttribute('aria-pressed', wasOn ? 'false' : 'true');
  } finally {
    await page.reload();
    if (((await toggle().getAttribute('aria-pressed')) === 'true') !== wasOn) {
      await toggle().click();
      await expect(toggle()).toHaveAttribute('aria-pressed', wasOn ? 'true' : 'false');
    }
  }
});

test('an import is previewed, applied once, leaves dishes it does not mention alone, and can be rolled back', async ({ page }) => {
  test.setTimeout(180_000);
  const data = await dataHref(page);
  await page.goto(data);

  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Menu');
  sheet.addRow(['item_id', 'category_ar', 'category_en', 'item_name_ar', 'item_name_en', 'description_ar', 'price']);
  sheet.addRow(['', 'الشاورما', 'Shawarma', 'صنف اختبار الاستيراد', 'Import test dish', 'وصف تجريبي', '12.5']);
  const buffer = Buffer.from(await book.xlsx.writeBuffer());

  await page.locator('input[type="file"][accept*="xlsx"]').first().setInputFiles({
    name: 'import-test.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  });
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('[data-import-preview]')).toBeVisible();
  await page.getByRole('button', { name: /^Import 1 rows$/ }).click();
  await expect(page.getByText(/Imported: 1 created/)).toBeVisible();

  const manage = data.replace(/\/data$/, '/manage');
  await page.goto(manage);
  await expect(page.getByText('Import test dish').first()).toBeVisible();
  // The file did not mention this dish, and it is still there.
  await expect(dishRow(page)).toHaveCount(1);

  await page.goto(data);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Roll back' }).first().click();
  await page.goto(manage);
  await expect(page.getByText('Import test dish')).toHaveCount(0);
});

test('a legacy .xls file is refused with a plain instruction', async ({ page }) => {
  await page.goto(await dataHref(page));
  await page.locator('input[type="file"][accept*="xlsx"]').first().setInputFiles({
    name: 'old-menu.xls',
    mimeType: 'application/vnd.ms-excel',
    buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]),
  });
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByText(/save it as \.xlsx or \.csv/)).toBeVisible();
});
