import { expect, test } from '@playwright/test';
import { FONT_FACES } from '../src/menu-studio/typography';

/**
 * Proves the shipped webfonts actually render.
 *
 * A unit test can only prove the files exist and the stacks name them. Whether
 * a browser downloads a face and draws with it is a browser question, so it is
 * asked in a browser: each family is measured against a deliberately missing
 * font, and a face that failed to load would measure identically to it.
 *
 * This is the test that would have caught the state the platform shipped in
 * for its first ten template families — a typography engine that chose font
 * *names* while every page rendered in the reader's system fonts.
 */

const FAMILIES = [...new Set(FONT_FACES.map((face) => face.family).filter(Boolean))] as string[];

/** Arabic and Latin, because a face may cover one and not the other. */
const SAMPLE: Record<string, string> = {
  Amiri: 'مطعم نور',
  Cairo: 'برجر الدجاج',
  Tajawal: 'قائمة الطعام',
  'El Messiri': 'عرض اليوم',
  'Playfair Display': 'Nour Restaurant',
  Inter: 'Chicken Burger 42 SAR',
};

test('every shipped family loads and draws differently from a fallback', async ({ page }) => {
  const requested = new Set<string>();
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/fonts/')) requested.add(url.split('/').pop() as string);
  });

  await page.goto('/', { waitUntil: 'networkidle' });

  const results = await page.evaluate(async (families: [string, string][]) => {
    await Promise.all(
      families.map(([family, text]) => document.fonts.load(`40px "${family}"`, text)),
    );
    await document.fonts.ready;

    const measure = (stack: string, text: string) => {
      const span = document.createElement('span');
      span.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font-size:40px;font-family:${stack}`;
      span.textContent = text;
      document.body.append(span);
      const width = span.getBoundingClientRect().width;
      span.remove();
      return width;
    };

    return families.map(([family, text]) => ({
      family,
      available: document.fonts.check(`40px "${family}"`, text),
      width: measure(`"${family}", serif`, text),
      fallback: measure('"No Such Font XYZ", serif', text),
    }));
  }, FAMILIES.map((family) => [family, SAMPLE[family] ?? family]) as [string, string][]);

  for (const result of results) {
    expect(result.available, `${result.family} reports as available`).toBe(true);
    expect(
      Math.abs(result.width - result.fallback),
      `${result.family} draws with its own metrics, not the fallback's`,
    ).toBeGreaterThan(0.5);
  }

  // The files really were fetched, rather than resolved from a system install
  // that happens to share the name.
  expect(requested.size).toBeGreaterThan(0);
});

test('an Arabic profile preloads Arabic subsets and not Latin ones', async ({ page }) => {
  await page.goto('/m/DEM001?lang=ar', { waitUntil: 'domcontentloaded' });

  const preloads = await page.$$eval('link[rel="preload"][as="font"]', (links) =>
    links.map((link) => (link as HTMLLinkElement).getAttribute('href') ?? ''),
  );

  expect(preloads.length).toBeGreaterThan(0);
  for (const href of preloads) {
    expect(href, 'preloads the script the page is drawn in').toContain('-arabic.woff2');
  }
});

test('an English profile preloads Latin subsets instead', async ({ page }) => {
  await page.goto('/m/DEM001?lang=en', { waitUntil: 'domcontentloaded' });

  const preloads = await page.$$eval('link[rel="preload"][as="font"]', (links) =>
    links.map((link) => (link as HTMLLinkElement).getAttribute('href') ?? ''),
  );

  expect(preloads.length).toBeGreaterThan(0);
  for (const href of preloads) {
    expect(href).toContain('-latin.woff2');
  }
});

test('the profile draws its headings in the brand face, not a system fallback', async ({
  page,
}) => {
  await page.goto('/m/DEM001?lang=ar', { waitUntil: 'networkidle' });

  const heading = page.locator('[data-profile-root] h1').first();
  await expect(heading).toBeVisible();

  const family = await heading.evaluate((el) => getComputedStyle(el).fontFamily);

  // The brand layer emits a real stack; the first name in it is a shipped face.
  expect(family).toMatch(/Amiri|Cairo|Tajawal|El Messiri|Playfair Display|Inter/);
});
