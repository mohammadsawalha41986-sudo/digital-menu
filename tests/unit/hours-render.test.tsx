import { describe, expect, it } from 'vitest';
/**
 * Renders the shared hours section straight to markup, so the section is
 * proven to produce a page without needing a database. The integration suite
 * covers it inside a real profile; this covers the part that has no excuse to
 * be untested locally.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { HoursSection } from '@/templates/shared/sections';
import { getDictionary } from '@/i18n/dictionary';
import type { WorkingHours } from '@/server/business/hours';

const SALON: WorkingHours = {
  timezone: 'Asia/Riyadh',
  days: {
    sunday: { closed: false, intervals: [{ opens: '10:00', closes: '13:30' }, { opens: '16:00', closes: '21:00' }] },
    friday: { closed: true, intervals: [] },
  },
};

describe('hours render', () => {
  it('renders Arabic markup with a state badge and a day list', () => {
    const html = renderToStaticMarkup(
      <HoursSection hours={SALON} locale="ar" dictionary={getDictionary('ar')} prefix="luxury" />,
    );
    expect(html).toContain('luxury__hours');
    expect(html).toContain('data-open=');
    expect(html).toMatch(/مفتوح الآن|مغلق/);
    expect(html).toContain('الأحد');
    expect(html).toContain('الجمعة');
  });

  it('renders English with the same data', () => {
    const html = renderToStaticMarkup(
      <HoursSection hours={SALON} locale="en" dictionary={getDictionary('en')} prefix="bold" />,
    );
    expect(html).toContain('Sunday');
    expect(html).toMatch(/Open now|Closed/);
  });

  it('renders nothing when there are no hours', () => {
    expect(
      renderToStaticMarkup(
        <HoursSection hours={null} locale="en" dictionary={getDictionary('en')} prefix="bold" />,
      ),
    ).toBe('');
  });
});
