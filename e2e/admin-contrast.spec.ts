import { expect, test, type Page } from '@playwright/test';

/**
 * The admin surface, measured rather than eyeballed.
 *
 * This exists because one defect has now happened twice. `.admin a` outweighs
 * a single component class, so any link that styles itself — a button, a nav
 * item marking the current page — lost its own colour and rendered accent on
 * accent: a solid green rectangle with invisible text. It was fixed once by
 * excluding `.admin__button` and immediately recurred on
 * `.admin__nav-link[aria-current]`, where it made the current page the one
 * sidebar item that could not be read.
 *
 * Eyeballing did not catch either. Measuring does.
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

/** Walks the visible text of the current page and returns anything under 4.5:1. */
async function contrastFailures(page: Page) {
  return page.evaluate(() => {
    const channels = (value: string): [number, number, number, number] | null => {
      const srgb =
        /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?/.exec(value);
      if (srgb) {
        return [
          Number(srgb[1]) * 255,
          Number(srgb[2]) * 255,
          Number(srgb[3]) * 255,
          srgb[4] === undefined ? 1 : Number(srgb[4]),
        ];
      }

      const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(value);
      return rgb
        ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])]
        : null;
    };

    const luminance = (rgb: [number, number, number]): number => {
      const linear = (channel: number) => {
        const s = channel / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };

      return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
    };

    /** Composites translucent layers, the way the compositor does. */
    const behind = (element: Element): [number, number, number] => {
      const layers: [number, number, number, number][] = [];
      let node: Element | null = element;

      while (node) {
        const parsed = channels(getComputedStyle(node).backgroundColor);
        if (parsed && parsed[3] > 0) {
          layers.push(parsed);
          if (parsed[3] >= 1) break;
        }
        node = node.parentElement;
      }

      let base: [number, number, number] = [255, 255, 255];

      for (const [r, g, b, a] of layers.reverse()) {
        base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)];
      }

      return base;
    };

    const failures: { text: string; ratio: number; className: string }[] = [];

    for (const element of document.querySelectorAll(
      'a, button, h1, h2, h3, p, span, li, dt, dd, th, td, label, kbd',
    )) {
      if (element.children.length > 0) continue;

      const text = element.textContent?.trim();
      if (!text) continue;

      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      if (!(element as HTMLElement).offsetParent && style.position !== 'fixed') continue;

      const parsed = channels(style.color);
      if (!parsed) continue;

      const foreground = luminance([parsed[0], parsed[1], parsed[2]]);
      const background = luminance(behind(element));

      const [lighter, darker] =
        foreground > background ? [foreground, background] : [background, foreground];
      const ratio = (lighter + 0.05) / (darker + 0.05);

      if (ratio < 4.5) {
        failures.push({
          text: text.slice(0, 28),
          ratio: Number(ratio.toFixed(2)),
          className: String((element as HTMLElement).className),
        });
      }
    }

    return failures;
  });
}

const PAGES = ['/admin', '/admin/businesses', '/admin/search', '/admin/account'];

test('the admin reads at 4.5:1, including the link for the page you are on', async ({ page }) => {
  await signIn(page);

  for (const path of PAGES) {
    await page.goto(path);
    expect(await contrastFailures(page), path).toEqual([]);
  }
});

test('the command palette reads at 4.5:1, highlighted row included', async ({ page }) => {
  await signIn(page);
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();

  // The highlighted row inverts to accent-on-accent-ink; its hint text is the
  // part most likely to be left behind on a muted grey.
  await expect(page.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');

  expect(await contrastFailures(page)).toEqual([]);
});
