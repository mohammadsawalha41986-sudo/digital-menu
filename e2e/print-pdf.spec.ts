import { inflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';

/**
 * The printable menu, and the PDF it produces (master spec §59, §60, §62).
 *
 * The platform deliberately produces its PDF through the browser rather than
 * writing one on the server, and Arabic is the reason: a PDF written directly
 * must embed an Arabic subset, apply bidirectional reordering, and shape every
 * letter into its initial, medial, final or isolated form. All three fail
 * silently into something that looks plausible to a developer who does not
 * read Arabic and is gibberish to the customer.
 *
 * So the thing worth testing is exactly that: that the PDF this page yields
 * contains real, complete, correctly-mapped Arabic.
 */

test('the printable menu renders the business, its items and its prices', async ({ page }) => {
  await page.goto('/m/DEM001/print?lang=ar', { waitUntil: 'networkidle' });

  const root = page.locator('[data-print-menu]');
  await expect(root).toBeVisible();
  await expect(root).toHaveAttribute('dir', 'rtl');

  // Real content, not a placeholder.
  await expect(page.locator('.print__name')).not.toBeEmpty();
  expect(await page.locator('.print__item').count()).toBeGreaterThan(0);
});

test('the print button is on screen and absent from the paper', async ({ page }) => {
  await page.goto('/m/DEM001/print?lang=ar');

  await expect(page.locator('.print__action')).toBeVisible();

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.print__action')).toBeHidden();
});

test('photography is dropped from the paper, which is where it costs ink', async ({ page }) => {
  await page.goto('/m/DEM001/print?lang=ar');
  await page.emulateMedia({ media: 'print' });

  // The printable page carries no images at all by construction.
  expect(await page.locator('[data-print-menu] img').count()).toBe(0);
});

test('the permanent address is printed, so paper leads back to the live menu', async ({ page }) => {
  await page.goto('/m/DEM001/print?lang=ar');

  const footer = await page.locator('.print__foot').innerText();
  expect(footer).toContain('/m/DEM001');
});

test('the generated PDF contains complete, correctly-mapped Arabic', async ({ page }) => {
  await page.goto('/m/DEM001/print?lang=ar', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  // Collect the Arabic actually on the page, to compare against the PDF.
  const onPage = await page.evaluate(() => document.body.innerText);
  const lettersOnPage = new Set(
    [...onPage].filter((character) => /[؀-ۿ]/.test(character)),
  );

  expect(lettersOnPage.size).toBeGreaterThan(5);

  const pdf = await page.pdf({ format: 'A4', printBackground: true });

  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

  // Fonts must be *embedded*, not referenced: a PDF that assumes an Arabic
  // face exists on the reader's machine is the failure this approach avoids.
  expect(pdf.includes(Buffer.from('/FontFile2'))).toBe(true);

  // Every Arabic letter on the page must be reachable from the PDF's
  // ToUnicode maps — that is what makes the text selectable and readable to
  // assistive technology, and it is absent when shaping has gone wrong.
  const mapped = extractMappedCodepoints(pdf);

  for (const letter of lettersOnPage) {
    expect(mapped.has(letter.codePointAt(0) as number), `PDF is missing ${letter}`).toBe(true);
  }
});

/** Reads the Unicode values a PDF's CMaps declare, including object streams. */
function extractMappedCodepoints(pdf: Buffer): Set<number> {
  const points = new Set<number>();

  const streamStart = /stream\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = streamStart.exec(pdf.toString('latin1'))) !== null) {
    const start = match.index + match[0].length;
    const end = pdf.indexOf('endstream', start);
    if (end === -1) continue;

    let inflated: Buffer;
    try {
      inflated = inflateSync(pdf.subarray(start, end));
    } catch {
      continue;
    }

    const text = inflated.toString('latin1');
    if (!text.includes('beginbfchar') && !text.includes('beginbfrange')) continue;

    for (const pair of text.matchAll(/<([0-9A-Fa-f]{4})>\s*<((?:[0-9A-Fa-f]{4})+)>/g)) {
      const destination = pair[2] as string;
      for (let index = 0; index < destination.length; index += 4) {
        points.add(parseInt(destination.slice(index, index + 4), 16));
      }
    }
  }

  return points;
}
