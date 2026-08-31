import Link from 'next/link';
import { requireUser } from '@/server/auth/current-user';
import { globalSearch, type SearchKind } from '@/server/admin/search';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<SearchKind, string> = {
  business: 'Business',
  branch: 'Branch',
  menu: 'Menu',
  category: 'Category',
  item: 'Item',
  offer: 'Offer',
  file: 'File',
};

/**
 * Global search (§91).
 *
 * A plain form and a server render rather than a live-updating box: it is one
 * round trip, it works with no JavaScript, the browser's back button behaves,
 * and the result is linkable. A search-as-you-type box would query the
 * database on every keystroke to feel slightly faster.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const user = await requireUser();

  const term = typeof query.q === 'string' ? query.q : '';
  const { hits, truncated } = await globalSearch(user, term);

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Search</h1>
          <p className="admin__subtitle">
            Businesses, branches, menus, categories, items, offers and files.
          </p>
        </div>
      </header>

      <section className="admin__panel">
        <form method="get" className="admin__actions">
          <input
            name="q"
            defaultValue={term}
            className="admin__input quick__search"
            placeholder="Chicken burger, DEM001, breakfast…"
            aria-label="Search"
            autoFocus
          />
          <button type="submit" className="admin__button">
            Search
          </button>
        </form>

        {term.trim().length > 0 && term.trim().length < 2 ? (
          <p className="admin__hint">Type at least two characters.</p>
        ) : null}
      </section>

      {term.trim().length >= 2 ? (
        <section className="admin__panel">
          <h2 className="admin__panel-title">
            {hits.length} result{hits.length === 1 ? '' : 's'}
            {truncated ? ' (showing the first 60)' : ''}
          </h2>

          {hits.length === 0 ? (
            <p className="admin__empty">Nothing matched “{term}”.</p>
          ) : (
            <ul className="admin__findings">
              {hits.map((result) => (
                <li key={`${result.kind}-${result.href}-${result.subtitle}`} data-hit={result.kind}>
                  <span className="admin__finding-area">{KIND_LABEL[result.kind]}</span>
                  <span className="admin__finding-message">
                    <Link href={result.href}>{result.title}</Link>
                    <span className="admin__hint">
                      {' '}
                      {result.subtitle} · {result.businessName}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </>
  );
}
