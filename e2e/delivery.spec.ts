import { expect, test, type Browser, type Page } from '@playwright/test';
import { signIn } from './support/admin';

/**
 * Delivery by distance, the way an owner sets it and a customer orders.
 *
 * The owner sets where the demo restaurant is and what each distance costs. A
 * customer who shares a location sees the fee added to the total and written
 * into the WhatsApp order, with the name, phone, address, apartment and a map
 * link. A customer past the farthest band cannot send a delivery order.
 * The demo restaurant's delivery settings are cleared again afterwards.
 */

const MENU = '/m/SBH001?lang=ar';
const NEAR = { latitude: 24.73, longitude: 46.6753 }; // about 1.8 km north of the restaurant
const FAR = { latitude: 24.9, longitude: 46.6753 }; // about 20.7 km north

test.describe.configure({ mode: 'serial' });

async function deliveryHref(page: Page): Promise<string> {
  await page.goto('/admin/businesses');
  const href = await page.locator('a[href="/m/SBH001"]').first().evaluate((link) =>
    link.closest('article')?.querySelector('a[href^="/admin/businesses/"]')?.getAttribute('href') ?? '',
  );
  expect(href).toBeTruthy();
  return `${href}/delivery`;
}

async function saveSettings(page: Page, lat: string, lng: string, bands: [string, string][]) {
  await page.goto(await deliveryHref(page));
  const remove = page.getByRole('button', { name: /Remove band/ });
  while ((await remove.count()) > 0) await remove.first().click();
  await page.getByLabel('خط العرض · Latitude').fill(lat);
  await page.getByLabel('خط الطول · Longitude').fill(lng);
  for (const [index, [km, fee]] of bands.entries()) {
    await page.getByRole('button', { name: /إضافة مسافة/ }).click();
    await page.getByLabel(new RegExp(`Up to km, band ${index + 1}$`)).fill(km);
    await page.getByLabel(new RegExp(`Fee, band ${index + 1}$`)).fill(fee);
  }
  await page.getByRole('button', { name: /حفظ إعدادات التوصيل/ }).click();
  await expect(page.getByRole('status')).toContainText('Saved');
}

async function customerAt(browser: Browser, geolocation: { latitude: number; longitude: number }) {
  const context = await browser.newContext({ geolocation, permissions: ['geolocation'], locale: 'ar-SA' });
  const page = await context.newPage();
  await page.goto(MENU);
  const card = page.locator('#menu-items-container [data-item]').first();
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button').last().click();
  // Adding opens the cart drawer on its own.
  await page.getByRole('button', { name: /إضافة إلى الطلب/ }).click();
  await page.getByRole('button', { name: 'توصيل', exact: true }).click();
  // Record the address the page asks to open rather than loading WhatsApp.
  await page.evaluate(() => {
    window.open = ((url: string) => {
      (window as unknown as { openedUrl: string }).openedUrl = url;
      return null;
    }) as typeof window.open;
  });
  return { context, page };
}

async function opened(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as { openedUrl?: string }).openedUrl ?? '');
}

async function amount(page: Page, selector: string): Promise<number> {
  const text = (await page.locator(selector).first().textContent()) ?? '';
  // The first number in the text: the currency unit ("ر.س") has dots of its own.
  const latin = text.replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660)).replace(/٫/g, '.').replace(/[,٬]/g, '');
  const match = /\d+(?:\.\d+)?/.exec(latin);
  return match ? Number(match[0]) : Number.NaN;
}

async function fillDetails(page: Page) {
  await page.getByLabel('الاسم', { exact: true }).fill('سارة');
  await page.getByLabel('رقم الجوال', { exact: true }).fill('0551234567');
  await page.getByLabel('العنوان', { exact: true }).fill('حي العليا، شارع التحلية، مبنى 12');
  await page.getByLabel('الشقة / الطابق (إن وجد)').fill('شقة 4');
}

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page);
  await saveSettings(page, '', '', []);
  await context.close();
});

test('a nearby customer sees the delivery fee in the total and in the WhatsApp order', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await signIn(page);
  await saveSettings(page, '24.713600', '46.675300', [
    ['3', '5'],
    ['8', '12'],
  ]);

  const { context, page: customer } = await customerAt(browser, NEAR);
  try {
    // Nothing goes out until the delivery details are there.
    await customer.getByRole('button', { name: /إرسال الطلب عبر واتساب/ }).click();
    await expect(customer.getByText('أكمل بيانات التوصيل المطلوبة أعلاه.')).toBeVisible();
    expect(await opened(customer)).toBe('');

    await fillDetails(customer);
    const subtotal = await amount(customer, '[data-order-total]');
    await expect(customer.locator('[data-delivery-fee]')).toContainText('يحددها المطعم');

    await customer.getByRole('button', { name: /حدد موقعي لحساب رسوم التوصيل/ }).click();
    await expect(customer.locator('[data-delivery-status]')).toContainText(/رسوم التوصيل 5/);
    await expect.poll(() => amount(customer, '[data-order-total]')).toBeCloseTo(subtotal + 5, 2);

    await customer.getByRole('button', { name: /إرسال الطلب عبر واتساب/ }).click();
    const url = await opened(customer);
    expect(url).toMatch(/^https:\/\/wa\.me\/966580060067\?text=.+/);
    const message = decodeURIComponent(url.split('?text=')[1] ?? '');
    expect(message).toContain('👤 الاسم: سارة');
    expect(message).toContain('📞 الجوال: 0551234567');
    expect(message).toContain('🏠 العنوان: حي العليا، شارع التحلية، مبنى 12');
    expect(message).toContain('🚪 الشقة / الطابق: شقة 4');
    expect(message).toContain('https://www.google.com/maps?q=24.730000,46.675300');
    expect(message).toMatch(/🚚 رسوم التوصيل: 5/);
    expect(message).toContain('الإجمالي النهائي');
  } finally {
    await context.close();
  }
});

test('a customer past the farthest distance cannot send a delivery order', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await signIn(page);
  await saveSettings(page, '24.713600', '46.675300', [['8', '12']]);

  const { context, page: customer } = await customerAt(browser, FAR);
  try {
    await fillDetails(customer);
    await customer.getByRole('button', { name: /حدد موقعي لحساب رسوم التوصيل/ }).click();
    await expect(customer.locator('[data-delivery-status]')).toContainText('والمطعم يوصّل حتى 8 كم');

    await customer.getByRole('button', { name: /إرسال الطلب عبر واتساب/ }).click();
    await expect(customer.getByText('العنوان خارج نطاق التوصيل.')).toBeVisible();
    expect(await opened(customer)).toBe('');
  } finally {
    await context.close();
  }
});
