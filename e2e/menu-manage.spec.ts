import { expect, test, type Page } from '@playwright/test';
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

  const original = await page.getByLabel('الاسم بالإنجليزي · Name (English)').inputValue();
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
  const original = await page.getByLabel('الاسم بالإنجليزي · Name (English)').inputValue();

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
    await page.getByRole('dialog', { name: /Edit/ }).getByRole('button', { name: /أخذ النسخة الحالية · Use theirs/ }).click();
    await expect(page.getByLabel('الاسم بالإنجليزي · Name (English)')).toHaveValue(theirs);
  } finally {
    // Each screen is put back even when the check before it fails, so a failed run never leaves a suffix behind.
    try {
      await page.getByLabel('الاسم بالإنجليزي · Name (English)').fill(original);
      await expect(page.locator('.mg__drawer-status')).toContainText('Saved');
    } finally {
      try {
        // The other screen is out of date now: reload it before putting the name back there.
        await otherPage.reload();
        await dishRow(otherPage).getByRole('button', { name: /تعديل · Edit/ }).first().click();
        await expect(otherPage.getByRole('dialog', { name: /Edit/ })).toBeVisible();
        // The first screen has put the name back already, so usually there is nothing left to save here.
        const otherName = otherPage.getByLabel('الاسم بالإنجليزي · Name (English)');
        if ((await otherName.inputValue()) !== original) {
          await otherName.fill(original);
          await expect(otherPage.locator('.mg__drawer-status')).toContainText('Saved');
        }
      } finally {
        await other.close();
      }
    }
  }
});

test('a save that fails keeps the edit on screen, and retry sends it once the server answers', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(await manageHref(page));
  await openEditor(page);
  const original = await page.getByLabel('الاسم بالإنجليزي · Name (English)').inputValue();

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
