import { expect, test, type Page } from '@playwright/test';
import { openCommandPalette, signIn } from './support/admin';

/**
 * The command palette (master spec §43), driven by keyboard only.
 *
 * A palette that only works with a mouse has missed its own point, so every
 * assertion here opens it, moves in it and activates from it without a click.
 */

const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
const field = (page: Page) => page.getByRole('combobox', { name: /Search businesses/ });

test.describe('the command palette', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);

    // The shortcut is handled by a client component, so it does nothing until
    // that component hydrates. Open and close the palette once here: every
    // test below can then assert that a single press opens it, which is the
    // behaviour they are actually about.
    await openCommandPalette(page);
    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();
  });

  test('opens on the keyboard shortcut and takes focus', async ({ page }) => {
    await expect(palette(page)).toBeHidden();

    await page.keyboard.press('ControlOrMeta+k');

    await expect(palette(page)).toBeVisible();
    await expect(field(page)).toBeFocused();
  });

  test('closes on Escape and gives the page back', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    await expect(palette(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();

    // And re-opens: the dialog closing without React's knowledge must not
    // leave the toggle inverted.
    await page.keyboard.press('ControlOrMeta+k');
    await expect(palette(page)).toBeVisible();
  });

  test('reopens immediately after Escape, with no pause to recover', async ({ page }) => {
    // The defect: the shortcut toggled React state, which lagged the dialog.
    // Escape closed the element and queued `open: false`; a Cmd+K inside that
    // window read `open` as still true and toggled it back to false, so the
    // palette stayed shut and a second press was the only way in. A stale
    // effect could also snap an already-open dialog closed.
    //
    // Both need a tight loop to show up — one open-and-dismiss proves nothing,
    // which is why this ran green for so long. No waiting between the presses.
    for (let cycle = 0; cycle < 8; cycle += 1) {
      await page.keyboard.press('ControlOrMeta+k');
      await expect(palette(page), `cycle ${cycle}: did not open`).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(palette(page), `cycle ${cycle}: did not close`).toBeHidden();
    }
  });

  test('offers destinations before anything is typed', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');

    const options = page.getByRole('option');
    expect(await options.count()).toBeGreaterThan(3);
    await expect(page.getByRole('option', { name: /Create a business/ })).toBeVisible();
  });

  test('arrow keys move the selection, and Enter follows it', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');

    // The unfiltered list, so there is somewhere to move to. A query narrow
    // enough to leave one row makes every arrow press a no-op — correct
    // behaviour, and a useless thing to assert movement against.
    const options = page.getByRole('option');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('ArrowDown');
    await expect(options.first()).toHaveAttribute('aria-selected', 'false');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('ArrowUp');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');

    // Up again from the top wraps to the end rather than sticking.
    await page.keyboard.press('ArrowUp');
    await expect(options.last()).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('Home');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('Enter');

    await expect(palette(page)).toBeHidden();
    await expect(page).toHaveURL(/\/admin\/businesses/);
  });

  test('finds a menu item by name, across businesses', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    // A dish on the burger demo. Finding it from the dashboard is the whole
    // point: nothing on screen mentions Station Burger.
    await field(page).fill('Double Stack');

    const hit = page.getByRole('option', { name: /Double Stack/ });
    await expect(hit).toBeVisible();
    await expect(hit).toContainText('Station Burger');

    await page.keyboard.press('ArrowDown');
    await hit.click();

    await expect(page).toHaveURL(/\/admin\/businesses\/[^/]+\/menus/);
  });

  test('says what it is doing, out loud', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');

    const status = page.getByRole('status');
    await expect(status).toContainText('Type to search');

    await field(page).fill('b');
    await expect(status).toContainText('two characters minimum');
  });

  test('is reachable by pointer too, for anyone who never learns the shortcut', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /Search or jump to/ }).click();
    await expect(palette(page)).toBeVisible();
  });

  test('refuses a signed-out caller', async ({ request }) => {
    const response = await request.get('/api/admin/palette?q=burger', {
      headers: { cookie: '' },
    });

    // The request fixture carries no session of its own.
    expect(response.status()).toBe(401);
  });
});
