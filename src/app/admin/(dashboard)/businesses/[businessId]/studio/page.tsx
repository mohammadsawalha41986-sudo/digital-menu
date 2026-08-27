import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessForAdmin } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import { prisma } from '@/server/db/client';
import { getBrandPreset } from '@/server/brand/service';
import { listModifierGroups } from '@/server/menu-studio/modifiers';
import { listMedia } from '@/server/media/service';
import { resolveTheme, suggestThemes } from '@/menu-studio/themes';
import { summariseMargins } from '@/server/menu-studio/margin';
import { BrandIdentityPanel } from './brand-panel';
import { ModifiersPanel } from './modifiers-panel';

export const dynamic = 'force-dynamic';

/**
 * Menu Studio — the workspace (Menu Studio §1).
 *
 * Two halves, in the order the work happens: the brand identity that every
 * menu inherits, then the menu projects themselves. Each project card carries
 * what an operator needs to decide which one to open — theme, status, when it
 * was last edited, how much of it is priced — rather than a name and a chevron.
 */
export default async function StudioPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const user = await requireUser();

  const business = await getBusinessForAdmin(user, businessId).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  const [menus, preset, media, modifierGroups] = await Promise.all([
    prisma.menu.findMany({
      where: { businessId: business.id },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      include: {
        design: true,
        currentVersion: { select: { version: true, publishedAt: true } },
        categories: {
          select: {
            id: true,
            items: { select: { priceMinor: true, costMinor: true, imageMediaId: true } },
          },
        },
      },
    }),
    getBrandPreset(user, business.id),
    listMedia(user, business.id),
    listModifierGroups(user, business.id),
  ]);

  const suggestions = preset ? suggestThemes(preset.mood, preset.tone) : [];

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Menu Studio</h1>
          <p className="admin__subtitle">
            Build, brand and design the menus for {business.nameEn ?? business.nameAr}.
          </p>
        </div>
        <Link href={`/admin/businesses/${business.id}`} className="admin__button admin__button--secondary">
          Back to business
        </Link>
      </header>

      <BrandIdentityPanel
        businessId={business.id}
        preset={preset}
        images={media.map((item) => ({ id: item.id, url: item.url, altEn: item.altEn, altAr: item.altAr }))}
        suggestions={suggestions.map((entry) => ({
          key: entry.theme.key,
          label: entry.theme.label,
          reason: entry.reason,
        }))}
      />

      <ModifiersPanel
        businessId={business.id}
        currency={business.currency}
        groups={modifierGroups.map((group) => ({
          key: group.key,
          nameAr: group.nameAr,
          nameEn: group.nameEn,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          options: group.options.map((option) => ({
            key: option.key,
            nameAr: option.nameAr,
            nameEn: option.nameEn,
            priceDeltaMinor: option.priceDeltaMinor,
          })),
        }))}
      />

      <section className="admin__panel">
        <h2 className="admin__panel-title">Menu projects</h2>

        {menus.length === 0 ? (
          <p className="admin__empty">
            No menus yet. <Link href={`/admin/businesses/${business.id}/menus`}>Create one</Link>, or
            import a spreadsheet from{' '}
            <Link href={`/admin/businesses/${business.id}/data`}>Import &amp; export</Link>.
          </p>
        ) : (
          <ul className="studio__projects">
            {menus.map((menu) => {
              const items = menu.categories.flatMap((category) => category.items);
              const { theme, layout } = resolveTheme(
                menu.design?.themeKey ?? null,
                menu.design?.layoutKey ?? null,
              );
              const costs = summariseMargins(items);
              const withImages = items.filter((item) => item.imageMediaId !== null).length;

              return (
                <li key={menu.id} className="studio__project">
                  <div className="studio__project-head">
                    <h3 className="studio__project-title">{menu.titleEn ?? menu.titleAr}</h3>
                    <span className={`admin__badge admin__badge--${menu.status.toLowerCase()}`}>
                      {menu.status.toLowerCase()}
                    </span>
                  </div>

                  <dl className="studio__meta">
                    <div>
                      <dt>Theme</dt>
                      <dd>
                        {theme.label} · {layout.label}
                      </dd>
                    </div>
                    <div>
                      <dt>Items</dt>
                      <dd>{items.length}</dd>
                    </div>
                    <div>
                      <dt>With a photograph</dt>
                      <dd>
                        {withImages} of {items.length}
                      </dd>
                    </div>
                    <div>
                      <dt>Published</dt>
                      <dd>
                        {menu.currentVersion
                          ? `v${menu.currentVersion.version}`
                          : 'Not yet published'}
                      </dd>
                    </div>
                    <div>
                      <dt>Last edited</dt>
                      <dd>{menu.updatedAt.toISOString().slice(0, 10)}</dd>
                    </div>
                    <div>
                      <dt>Cost entered</dt>
                      {/* Stated as coverage, never as an average over items that
                          have no cost — that number would be fiction. */}
                      <dd>
                        {costs.covered === 0
                          ? 'None'
                          : `${costs.covered} of ${costs.total} items`}
                      </dd>
                    </div>
                  </dl>

                  <div className="studio__project-actions">
                    <Link href={`/admin/businesses/${business.id}/studio/${menu.id}`} className="admin__button">
                      Open in studio
                    </Link>
                    <Link
                      href={`/admin/businesses/${business.id}/menus`}
                      className="admin__button admin__button--secondary"
                    >
                      Edit content
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
