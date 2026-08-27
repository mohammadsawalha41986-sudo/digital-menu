import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 3 — the admin surface, driven the way an operator drives it.
 *
 * Nothing here is stubbed: signing in sets a real session cookie, saving
 * writes to the database, publishing runs the publication transaction, and
 * the assertions read the resulting public profile.
 */

const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'staff@example.com';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'devpassword12345';

async function signIn(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test('admin requires authentication', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('a wrong password is refused with a message that reveals nothing', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill('definitely-the-wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  const alert = page.locator('.admin__message--error');
  await expect(alert).toContainText('Incorrect email or password');

  // The same message for an address that does not exist — no enumeration.
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill('nobody@example.test');
  await page.getByLabel('Password').fill('definitely-the-wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.admin__message--error')).toContainText(
    'Incorrect email or password',
  );
});

test('signing in reaches a dashboard with live counts', async ({ page }) => {
  await signIn(page);

  const cards = page.locator('.admin__card');
  await expect(cards.first()).toBeVisible();
  // Metric labels live inside the cards; the sidebar also says "Businesses".
  await expect(cards.filter({ hasText: 'Businesses' })).toHaveCount(1);
  await expect(cards.first().locator('.admin__metric')).toHaveText(/^\d+$/);
});

test('the business list links to the permanent public profile', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Businesses' }).first().click();

  await expect(page.getByRole('heading', { name: 'Businesses' })).toBeVisible();
  await expect(page.getByRole('link', { name: '/m/DEM001' })).toBeVisible();
});

test('QR screen renders codes and reports readability', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/businesses');
  await page.getByRole('link', { name: 'Demo Restaurant' }).click();
  await page.getByRole('link', { name: 'QR codes' }).click();

  await expect(page.getByRole('heading', { name: 'QR codes' })).toBeVisible();
  // The destination shown is the permanent profile path.
  await expect(page.locator('.admin__destination').first()).toContainText('/m/DEM001');
  await expect(page.locator('.admin__qr-preview svg').first()).toBeVisible();
  await expect(page.getByText('Readability checks passed').first()).toBeVisible();

  // Branch codes are offered alongside the business code.
  await expect(page.locator('.admin__destination')).toContainText(['/m/DEM001', '/m/DEM001/b/olaya', '/m/DEM001/b/malaz']);
});

test('a price edit reaches the public profile behind the same URL', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/businesses');
  await page.getByRole('link', { name: 'Demo Restaurant' }).click();
  await page.getByRole('link', { name: /^Menus/ }).click();

  // Scope to the item panel: the category form on the same page also has a
  // "Name (Arabic)" field.
  const itemForm = page.locator('.admin__panel').filter({ hasText: 'Add or update an item' });
  await itemForm.getByLabel('Item code').fill('MN-002');
  await itemForm.getByLabel('Category').selectOption('mains');
  await itemForm.getByLabel('Name (Arabic)').fill('برجر لحم');
  await itemForm.getByLabel('Price (SAR)').fill('49.5');
  await itemForm.getByRole('button', { name: 'Save item' }).click();

  await expect(itemForm.getByRole('status')).toContainText(/Item (created|updated)/);

  // The public profile — same permanent URL — shows the new price.
  await page.goto('/m/DEM001?lang=en');
  await expect(page.locator('[data-item="MN-002"] [data-price]')).toContainText('49.5');

  // Restore, so the suite is re-runnable.
  await page.goto('/admin/businesses');
  await page.getByRole('link', { name: 'Demo Restaurant' }).click();
  await page.getByRole('link', { name: /^Menus/ }).click();
  const restoreForm = page.locator('.admin__panel').filter({ hasText: 'Add or update an item' });
  await restoreForm.getByLabel('Item code').fill('MN-002');
  await restoreForm.getByLabel('Category').selectOption('mains');
  await restoreForm.getByLabel('Name (Arabic)').fill('برجر لحم');
  await restoreForm.getByLabel('Price (SAR)').fill('45');
  await restoreForm.getByRole('button', { name: 'Save item' }).click();
  await expect(restoreForm.getByRole('status')).toContainText(/Item (created|updated)/);
});

test('signing out ends the session', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Sign out' }).click();

  await expect(page).toHaveURL(/\/admin\/login/);

  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
});
