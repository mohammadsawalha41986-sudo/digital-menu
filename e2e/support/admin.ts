import { expect, type Page } from '@playwright/test';

/**
 * Shared admin helpers for the e2e suites.
 *
 * Ten specs had each grown their own byte-identical `signIn`. That is fine
 * until one of them needs to change — as the command palette did, when a
 * hydration race started losing keystrokes under parallel load and the fix
 * had to be applied in every copy that had it. One definition instead.
 */

export const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'staff@example.com';
export const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'devpassword12345';

/** Signs in with a real session cookie and waits for the dashboard. */
export async function signIn(page: Page): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

/**
 * Opens the command palette with its keyboard shortcut and returns the search
 * box.
 *
 * Ctrl+K is handled by a client component, so the shortcut only answers once
 * that component has hydrated. Pressing once and assuming the palette opened
 * is a race, and it is the race this suite lost. Retrying the keystroke keeps
 * the shortcut itself under test while tolerating hydration latency.
 */
export async function openCommandPalette(page: Page) {
  const search = page.getByRole('combobox', { name: /Search businesses/ });

  await expect(async () => {
    await page.keyboard.press('ControlOrMeta+k');
    await expect(search).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });

  return search;
}
