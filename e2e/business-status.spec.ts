import { expect, test } from '@playwright/test';
import { signIn } from './support/admin';

/**
 * Reported in production: choosing "Active" and saving showed "Business
 * saved", then the status went back to "Draft" on screen. React resets a
 * submitted form to the values the page first rendered with, and a <select>
 * keeps its first option as its default — so the screen lied, and the next
 * save of any other field wrote "Draft" back over the saved "Active".
 */

const RUN = Date.now().toString(36).slice(-6);

test('saving a business keeps the chosen status on screen, and a second save does not undo it', async ({ page }) => {
  await signIn(page);

  await page.goto('/admin/businesses/new');
  await page.getByLabel('Name (Arabic)').fill('مطعم الحالة');
  await page.getByLabel('Slug').fill(`status-${RUN}`);
  await page.getByRole('button', { name: 'Create business' }).click();
  // The new-business page shows "Draft" too: wait for the business's own page.
  await page.waitForURL(/\/admin\/businesses\/(?!new)[a-z0-9]+$/);
  await expect(page.getByRole('button', { name: 'Save business' })).toBeVisible();
  await expect(page.getByLabel('Status')).toHaveValue('DRAFT');

  const status = page.getByLabel('Status');
  await status.selectOption('ACTIVE');
  await page.getByRole('button', { name: 'Save business' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Business saved' })).toBeVisible();
  // What the owner sees right after saving.
  await expect(status).toHaveValue('ACTIVE');

  // Saving another field must not write the old status back.
  await page.getByLabel('Description (Arabic)').fill('وصف');
  await page.getByRole('button', { name: 'Save business' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Business saved' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Status')).toHaveValue('ACTIVE');

  // Leave it out of the public directory.
  await page.getByLabel('Status').selectOption('INACTIVE');
  await page.getByRole('button', { name: 'Save business' }).click();
  await expect(page.getByLabel('Status')).toHaveValue('INACTIVE');
});
