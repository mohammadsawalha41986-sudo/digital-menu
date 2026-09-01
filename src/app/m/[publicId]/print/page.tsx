import { notFound } from 'next/navigation';
import { getPublicProfile } from '@/server/profile/repository';
import { resolveRequestLocale, type SearchParams } from '@/server/profile/render';
import { getDictionary } from '@/i18n/dictionary';
import { bcp47Of, directionOf } from '@/i18n/config';
import { brandTokensToStyle } from '@/design/brand';
import { formatPrice } from '@/i18n/format';
import { resolveContent } from '@/i18n/content';
import { buildQrDestination } from '@/server/qr/destination';
import { PrintButton } from './print-button';
import './print.css';

export const dynamic = 'force-dynamic';

export const metadata = { robots: { index: false, follow: false } };

/**
 * The printable menu (master spec §59, §60, §62).
 *
 * The spec is explicit that the PDF path must be real and must not be a fake
 * button. Two honest ways exist to produce one: render it on the server, or
 * let the browser do it. This is the second, and the choice is not laziness.
 *
 * Arabic is why. A PDF written directly has to embed a subset of an Arabic
 * face, apply bidirectional reordering, and shape each letter into its
 * initial, medial, final or isolated form — three problems whose failure mode
 * is a menu that looks fine to a developer who does not read Arabic and is
 * gibberish to the customer. A browser already does all three correctly, with
 * the same fonts the profile ships, so printing through it produces a
 * *typographically correct* Arabic PDF rather than a plausible-looking one.
 *
 * So this is a real page laid out for paper: no photography, no navigation,
 * no interactive chrome, prices in a column, categories that do not split
 * across a page break, and the QR destination printed at the foot so a paper
 * menu still leads back to the live one.
 *
 * `docs/PUBLISHING.md` records what server-side generation would additionally
 * require, so the decision is documented rather than merely deferred.
 */
export default async function PrintablePage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { publicId } = await params;
  const resolved = await searchParams;

  const profile = await getPublicProfile(publicId);
  if (!profile) notFound();

  const locale = await resolveRequestLocale(resolved, profile.defaultLocale);
  const dictionary = getDictionary(locale);
  const direction = directionOf(locale);

  const name = resolveContent({ ar: profile.nameAr, en: profile.nameEn }, locale)?.value ?? '';
  const description =
    resolveContent({ ar: profile.descriptionAr, en: profile.descriptionEn }, locale)?.value ?? null;

  // Built from the same helper the QR encodes, so the address on paper and the
  // address in the code are provably the same string.
  const destination = buildQrDestination({ publicId: profile.publicId });

  const categories = profile.menus.flatMap((menu) =>
    menu.categories.map((category) => ({ menuTitle: menu.titleAr, category })),
  );

  return (
    <main
      className="print"
      lang={bcp47Of(locale)}
      dir={direction}
      data-print-menu={profile.publicId}
      style={brandTokensToStyle(profile.brand)}
    >
      <PrintButton label={locale === 'ar' ? 'طباعة أو حفظ PDF' : 'Print or save as PDF'} />

      <header className="print__head">
        <h1 className="print__name">{name}</h1>
        {description ? <p className="print__description">{description}</p> : null}
      </header>

      {categories.length === 0 ? (
        <p className="print__empty">{dictionary.profile.menuComingSoon}</p>
      ) : (
        categories.map(({ category }) => {
          const categoryName =
            resolveContent({ ar: category.nameAr, en: category.nameEn }, locale)?.value ?? '';

          if (category.items.length === 0) return null;

          return (
            <section className="print__category" key={category.key}>
              <h2 className="print__category-name">{categoryName}</h2>

              <ul className="print__items">
                {category.items
                  .filter((item) => !item.isUnavailable)
                  .map((item) => {
                    const itemName =
                      resolveContent({ ar: item.nameAr, en: item.nameEn }, locale)?.value ?? '';
                    const itemDescription = resolveContent(
                      { ar: item.descriptionAr, en: item.descriptionEn },
                      locale,
                    )?.value;

                    return (
                      <li className="print__item" key={item.code}>
                        <div className="print__item-text">
                          <span className="print__item-name">{itemName}</span>
                          {itemDescription ? (
                            <span className="print__item-description">{itemDescription}</span>
                          ) : null}
                        </div>

                        <span className="print__leader" aria-hidden="true" />

                        <span className="print__item-price">
                          {item.priceMinor === null
                            ? ''
                            : formatPrice(item.priceMinor, item.currency, locale)}
                          {item.calories !== null ? (
                            <span className="print__item-calories">
                              {' '}
                              {item.calories}
                              {locale === 'ar' ? ' سعرة' : ' kcal'}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </section>
          );
        })
      )}

      <footer className="print__foot">
        {/* A paper menu that cannot lead back to the live one wastes the
            permanent address the whole product is built on. */}
        <p>{destination}</p>
        {profile.contact.phone ? <p>{profile.contact.phone}</p> : null}
      </footer>
    </main>
  );
}
