import { expect, test, type Browser, type Page } from '@playwright/test';
import { signIn } from './support/admin';

/**
 * Customers and orders, end to end on the demo restaurant: a customer sends an
 * order from the menu and it appears in the restaurant's order log with its
 * value, name and number; the offers sign-up stays off the menu until the
 * restaurant turns it on, and a sign-up lands on the offers list. Sign-up is
 * turned off again at the end.
 */

const MENU = '/m/SBH001?lang=ar';

test.describe.configure({ mode: 'serial' });

async function customersHref(page: Page): Promise<string> {
  await page.goto('/admin/businesses');
  const href = await page.locator('a[href="/m/SBH001"]').first().evaluate((link) =>
    link.closest('article')?.querySelector('a[href^="/admin/businesses/"]')?.getAttribute('href') ?? '',
  );
  expect(href).toBeTruthy();
  return `${href}/customers`;
}

async function visitor(browser: Browser) {
  const context = await browser.newContext({ locale: 'ar-SA' });
  const page = await context.newPage();
  await page.goto(MENU);
  return { context, page };
}

async function setSignup(page: Page, on: boolean) {
  await page.goto(await customersHref(page));
  const toggle = page.getByRole('switch', { name: /Show offers sign-up on the menu/ });
  if ((await toggle.isChecked()) !== on) {
    await toggle.click();
    await expect(page.getByRole('status')).toContainText(on ? 'Offers sign-up is on' : 'Offers sign-up is off');
  }
}

test('an order sent from the menu appears in the restaurant’s order log with its value, name and number', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const phone = `05${String(Date.now()).slice(-8)}`;
  const name = `عميل ${phone.slice(-4)}`;

  const customer = await visitor(browser);
  try {
    const card = customer.page.locator('#menu-items-container [data-item]').first();
    await card.scrollIntoViewIfNeeded();
    await card.getByRole('button').last().click();
    await customer.page.getByRole('button', { name: /إضافة إلى الطلب/ }).click();

    await customer.page.getByLabel('الاسم (اختياري)').fill(name);
    await customer.page.getByLabel('رقم الجوال (اختياري)').fill(phone);
    // Sign-up is off: the cart offers no opt-in box.
    await expect(customer.page.locator('[data-offers-optin]')).toHaveCount(0);
    await expect(customer.page.locator('[data-order-privacy]')).toBeVisible();

    await customer.page.evaluate(() => {
      window.open = ((url: string) => {
        (window as unknown as { openedUrl: string }).openedUrl = url;
        return null;
      }) as typeof window.open;
    });
    const recorded = customer.page.waitForResponse((response) => response.url().endsWith('/api/orders'));
    await customer.page.getByRole('button', { name: /إرسال الطلب عبر واتساب/ }).click();
    expect((await recorded).status()).toBe(204);

    // WhatsApp still gets the order, now with the number.
    const opened = await customer.page.evaluate(() => (window as unknown as { openedUrl?: string }).openedUrl ?? '');
    expect(decodeURIComponent(opened)).toContain(phone);
  } finally {
    await customer.context.close();
  }

  await signIn(page);
  await page.goto(await customersHref(page));
  const digits = `966${phone.slice(1)}`;
  const row = page.locator('[data-order-row]', { hasText: `+${digits}` }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(name);
  await expect(page.locator(`[data-customer-row="${digits}"]`)).toContainText('لا · No');

  // Cancelling takes it out of the totals; the row says so.
  await row.getByRole('combobox', { name: /Order status/ }).selectOption('CANCELLED');
  await expect(page.locator('[data-order-row][data-status="CANCELLED"]', { hasText: `+${digits}` })).toHaveCount(1);
});

test('the offers sign-up is off the menu until the restaurant turns it on, and a sign-up joins the offers list', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const phone = `05${String(Date.now()).slice(-8)}`;
  const digits = `966${phone.slice(1)}`;

  const before = await visitor(browser);
  await expect(before.page.locator('[data-offers-signup]')).toHaveCount(0);
  await before.context.close();

  await signIn(page);
  await setSignup(page, true);
  try {
    const customer = await visitor(browser);
    try {
      const card = customer.page.locator('[data-offers-signup]');
      await card.scrollIntoViewIfNeeded();
      await card.getByLabel('رقم الجوال لاستلام العروض').fill(phone);
      // Consent is the customer's own tick: without it, nothing is sent.
      await card.getByRole('button', { name: 'اشترك' }).click();
      await expect(card).toContainText('وافق على استلام العروض');
      await card.getByRole('checkbox').check();
      await card.getByRole('button', { name: 'اشترك' }).click();
      await expect(card.getByRole('status')).toContainText('تم الاشتراك');
    } finally {
      await customer.context.close();
    }

    await page.goto(`${await customersHref(page)}?list=subscribers`);
    await expect(page.locator(`[data-customer-row="${digits}"]`)).toContainText('مشترك · Yes');

    const download = await page.request.get(`${await customersHref(page)}/export?scope=subscribers`);
    expect(download.status()).toBe(200);
    expect(await download.text()).toContain(`966 ${phone.slice(1)}`);
  } finally {
    await setSignup(page, false);
  }
});
