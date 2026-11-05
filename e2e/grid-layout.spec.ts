import { expect, test } from '@playwright/test';

/**
 * The adaptive dish grid on the Grid Lab menu (`/m/DEM008`), whose sections
 * hold 1, 2, 3, 4, 5, 6, 7, 8, 9, 11 and 20 dishes. Columns follow the
 * menu's content width; no section ends on a lone card beside an empty
 * space — that card spans the row (2 columns) or two columns (3 and 4) as a
 * horizontal card; the dishes keep the restaurant's order.
 */

const MENU = '/m/DEM008';
const COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 20];
const WIDTHS: Array<[width: number, columns: number]> = [
  [320, 1],
  [360, 2],
  [375, 2],
  [390, 2],
  [430, 2],
  [768, 2],
  [1024, 3],
  [1280, 4],
  [1440, 4],
  [1920, 4],
];

type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number };
type Card = {
  id: string;
  box: Box;
  /** The photo frame (or the no-photo stripe) and the text body. */
  lead: Box | null;
  body: Box | null;
};
type Section = {
  count: number;
  direction: string;
  tracks: number[];
  gap: number;
  gridWidth: number;
  cards: Card[];
  buttons: Array<{ width: number; height: number }>;
  clippedTitles: string[];
};

const sideBySide = (a: Box, b: Box) =>
  a.top < b.bottom - 1 && b.top < a.bottom - 1 && (a.right <= b.left + 1 || b.right <= a.left + 1);
const stacked = (top: Box, below: Box) => top.bottom <= below.top + 1;

for (const lang of ['ar', 'en'] as const) {
  for (const [width, columns] of WIDTHS) {
    test.describe(`${lang} at ${width}px`, () => {
      const phone = width < 768;
      test.use({
        viewport: { width, height: 900 },
        isMobile: phone,
        hasTouch: phone,
        deviceScaleFactor: phone ? 2 : 1,
        contextOptions: { reducedMotion: 'reduce' },
      });

      test(`every section ends intentionally in ${columns} column(s)`, async ({ page }) => {
        await page.addInitScript(() => sessionStorage.setItem('sf-welcome:DEM008', '1'));
        await page.goto(`${MENU}?lang=${lang}`);
        await expect(page.locator('#menu-items-container section[data-category]').first()).toBeVisible();

        const { overflow, sections } = await page.evaluate(() => {
          const box = (el: Element | null) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
          };
          const found = [...document.querySelectorAll('#menu-items-container section[data-category]')].flatMap(
            (section) => {
              const grid = section.querySelector('[data-section-layout="grid"]');
              if (!grid) return [];
              const style = getComputedStyle(grid);
              const cards = [...grid.querySelectorAll('[data-item]')];
              return [
                {
                  count: cards.length,
                  direction: style.direction,
                  tracks: style.gridTemplateColumns.split(' ').map(parseFloat),
                  gap: parseFloat(style.columnGap) || 0,
                  gridWidth: grid.getBoundingClientRect().width,
                  cards: cards.map((card) => ({
                    id: card.getAttribute('data-item') ?? '',
                    box: box(card)!,
                    lead: box(card.querySelector(':scope > .sf-card-media, :scope > .sf-card__stripe')),
                    body: box(card.querySelector(':scope > .sf-card__body')),
                  })),
                  buttons: cards.flatMap((card) =>
                    [...card.querySelectorAll('button')].map((b) => ({
                      width: b.getBoundingClientRect().width,
                      height: b.getBoundingClientRect().height,
                    })),
                  ),
                  clippedTitles: cards
                    .map((card) => card.querySelector('h3'))
                    .filter((h): h is HTMLHeadingElement => Boolean(h) && h!.scrollWidth > h!.clientWidth + 1)
                    .map((h) => h.textContent ?? ''),
                },
              ];
            },
          );
          return {
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            sections: found,
          };
        });

        // (a) Nothing runs off the side of the page.
        expect(overflow).toBeLessThanOrEqual(0);

        // Every dish count of the fixture is drawn as a grid section.
        expect([...new Set(sections.map((s) => s.count))].sort((a, b) => a - b)).toEqual(COUNTS);

        for (const section of sections as Section[]) {
          const label = `section of ${section.count}`;
          expect(section.tracks, `${label}: columns`).toHaveLength(columns);
          const track = section.tracks[0]!;

          // Rows by their top edge, in reading order within each row.
          const rtl = section.direction === 'rtl';
          const rows: Card[][] = [];
          for (const card of [...section.cards].sort((a, b) => a.box.top - b.box.top)) {
            const row = rows.find((r) => Math.abs(r[0]!.box.top - card.box.top) <= 2);
            if (row) row.push(card);
            else rows.push([card]);
          }
          for (const row of rows) row.sort((a, b) => (rtl ? b.box.right - a.box.right : a.box.left - b.box.left));

          // (b) The first row holds as many cards as fit; every row but the last is full.
          expect(rows[0], `${label}: first row`).toHaveLength(Math.min(section.count, columns));
          rows.slice(0, -1).forEach((row, index) => expect(row, `${label}: row ${index + 1} is full`).toHaveLength(columns));

          const last = rows[rows.length - 1]!;
          const rowCards = new Set<string>();
          if (columns === 1) {
            for (const card of section.cards) rowCards.add(card.id);
          } else if (last.length === 1) {
            // A lone last card spans two columns (the whole row in a two-column grid).
            const card = last[0]!;
            const expected = columns === 2 ? section.gridWidth : 2 * track + section.gap;
            expect(Math.abs(card.box.width - expected), `${label}: lone last card spans`).toBeLessThanOrEqual(2);
            rowCards.add(card.id);
          } else {
            // A last row of two or three keeps regular cards.
            for (const card of last) {
              expect(Math.abs(card.box.width - track), `${label}: last-row card is regular`).toBeLessThanOrEqual(2);
            }
          }

          for (const card of section.cards) {
            expect(card.lead, `${label}: ${card.id} has a photo frame or stripe`).not.toBeNull();
            expect(card.body, `${label}: ${card.id} has a body`).not.toBeNull();
            if (rowCards.has(card.id)) {
              // The horizontal card: the photo beside the text, not above it.
              expect(sideBySide(card.lead!, card.body!), `${label}: ${card.id} is a horizontal card`).toBe(true);
            } else {
              expect(stacked(card.lead!, card.body!), `${label}: ${card.id} is a regular card`).toBe(true);
            }
          }

          // (c) The visual order is the restaurant's order.
          expect(rows.flat().map((c) => c.id), `${label}: order`).toEqual(section.cards.map((c) => c.id));

          // (d) Every add button is a comfortable touch target.
          for (const button of section.buttons) {
            expect(button.width, `${label}: button width`).toBeGreaterThanOrEqual(44);
            expect(button.height, `${label}: button height`).toBeGreaterThanOrEqual(44);
          }

          // (e) No dish name is cut off at the side.
          expect(section.clippedTitles, `${label}: clipped names`).toEqual([]);
        }
      });
    });
  }
}
