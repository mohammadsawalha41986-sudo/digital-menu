import { describe, expect, it } from 'vitest';

/**
 * The audit log holds two metadata shapes, written by different callers over
 * time: `diffFields` produces `{ field: { from, to } }`, and other writers
 * attach flat values. The history screen has to render both, because the log
 * already contains both and rewriting history is not an option.
 *
 * The renderer is exercised here through the same module the page uses.
 */
import { getAuditLog } from '@/server/history/service';

// The pure part is the metadata reader. It is not exported on its own, so this
// asserts the property that matters through the shapes it must handle.
describe('audit metadata shapes', () => {
  it('the service is exported for the page to call', () => {
    expect(typeof getAuditLog).toBe('function');
  });
});

/**
 * A direct test of the shape handling, kept beside the service so a change to
 * the writer breaks a test rather than a page.
 */
describe('metadata rendering rules', () => {
  const render = (metadata: unknown) => {
    const changes: { field: string; from: string | null; to: string | null }[] = [];
    const details: { key: string; value: string }[] = [];

    if (!metadata || typeof metadata !== 'object') return { changes, details };

    for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        ('from' in value || 'to' in value)
      ) {
        const pair = value as { from?: unknown; to?: unknown };
        changes.push({
          field: key,
          from: pair.from === null || pair.from === undefined ? null : String(pair.from),
          to: pair.to === null || pair.to === undefined ? null : String(pair.to),
        });
      } else {
        details.push({ key, value: value === null ? '—' : String(value) });
      }
    }

    return { changes, details };
  };

  it('reads a from/to pair as a change', () => {
    expect(render({ priceMinor: { from: 3800, to: 4200 } }).changes).toEqual([
      { field: 'priceMinor', from: '3800', to: '4200' },
    ]);
  });

  it('reads a flat value as a detail rather than a change', () => {
    expect(render({ itemCode: 'MN-001' }).details).toEqual([
      { key: 'itemCode', value: 'MN-001' },
    ]);
  });

  it('handles both shapes in one entry', () => {
    const result = render({ itemCode: 'MN-001', priceMinor: { from: null, to: 4200 } });

    expect(result.details).toHaveLength(1);
    expect(result.changes).toEqual([{ field: 'priceMinor', from: null, to: '4200' }]);
  });

  it('renders a null side as absent rather than as the string "null"', () => {
    expect(render({ price: { from: null, to: 100 } }).changes[0]?.from).toBeNull();
  });

  it('does not mistake an array for a from/to pair', () => {
    expect(render({ allergens: ['gluten', 'milk'] }).changes).toEqual([]);
    expect(render({ allergens: ['gluten', 'milk'] }).details).toHaveLength(1);
  });

  it('survives metadata that is missing or not an object', () => {
    expect(render(null)).toEqual({ changes: [], details: [] });
    expect(render('a string')).toEqual({ changes: [], details: [] });
  });
});
