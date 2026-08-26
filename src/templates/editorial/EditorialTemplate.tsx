import { resolveContent } from '@/i18n/content';
import { LOCALE_LABELS, LOCALES, bcp47Of, directionOf } from '@/i18n/config';
import type { TemplateRenderProps } from '../types';

/**
 * Editorial — variant A.
 *
 * Phase 0 ships one real template so the render path is exercised end to end:
 * business content → template structure → brand tokens → RTL/LTR document.
 * The remaining nine families (§22) arrive in Phase 8; the point of shipping
 * one now is that adding the others is additive registry work, not surgery.
 *
 * Composition notes: type-led hero, generous inline padding, a rule-separated
 * menu index rather than a card grid (§102). Every directional value is
 * logical — `padding-inline`, `text-align: start`, `border-inline-start` — so
 * Arabic is laid out natively rather than mirrored (GOALS I4).
 */
export function EditorialTemplate({ profile, locale, dictionary }: TemplateRenderProps) {
  const name = resolveContent({ ar: profile.nameAr, en: profile.nameEn }, locale);
  const description = resolveContent(
    { ar: profile.descriptionAr, en: profile.descriptionEn },
    locale,
  );

  return (
    <article className="editorial">
      <header className="editorial__header">
        <nav aria-label={dictionary.common.languageSwitcher} className="editorial__locales">
          {LOCALES.map((candidate) => (
            <a
              key={candidate}
              href={`?lang=${candidate}`}
              lang={bcp47Of(candidate)}
              dir={directionOf(candidate)}
              aria-current={candidate === locale ? 'true' : undefined}
              className="editorial__locale"
              data-active={candidate === locale ? '' : undefined}
            >
              {LOCALE_LABELS[candidate]}
            </a>
          ))}
        </nav>

        {name ? (
          <h1
            className="editorial__title"
            lang={bcp47Of(name.sourceLocale)}
            dir={directionOf(name.sourceLocale)}
          >
            {name.value}
          </h1>
        ) : null}

        {description ? (
          <p
            className="editorial__lede"
            lang={bcp47Of(description.sourceLocale)}
            dir={directionOf(description.sourceLocale)}
          >
            {description.value}
          </p>
        ) : null}
      </header>

      <section className="editorial__menus" aria-labelledby="menus-heading">
        <h2 id="menus-heading" className="editorial__section-title">
          {dictionary.profile.viewMenu}
        </h2>

        {profile.menus.length === 0 ? (
          // Intentional empty state rather than a broken card (§120).
          <p className="editorial__empty">{dictionary.profile.menuComingSoon}</p>
        ) : (
          <ul className="editorial__menu-list">
            {profile.menus.map((menu) => {
              const title = resolveContent({ ar: menu.titleAr, en: menu.titleEn }, locale);
              if (!title) return null;

              return (
                <li key={menu.key} className="editorial__menu-item">
                  <span
                    className="editorial__menu-title"
                    lang={bcp47Of(title.sourceLocale)}
                    dir={directionOf(title.sourceLocale)}
                  >
                    {title.value}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </article>
  );
}
