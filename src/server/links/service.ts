import { prisma } from '@/server/db/client';
import { recordAudit } from '@/server/audit/log';
import { requireTenantContext, type AuthenticatedUser } from '@/server/tenancy/context';
import { probeLink, type LinkStatus } from './probe';

/**
 * Link Health (master spec §19).
 *
 * A profile's outbound links are the part most likely to rot without anyone
 * noticing: a business renames its Instagram handle and the button on its menu
 * has been dead for three months. Profile Health has always had a place to
 * report that; this is what fills it.
 *
 * Checks run on demand rather than on a timer. An agency with hundreds of
 * profiles should not have the platform quietly generating outbound traffic to
 * every address its clients have ever typed, and an operator who wants to know
 * whether a link works wants to know *now* — not at the next sweep.
 */

export type { LinkStatus };

/** A link the platform publishes on a business's behalf. */
export interface ProfileLink {
  /** Stable identifier for the field this came from. */
  field: string;
  label: string;
  url: string;
}

export interface LinkHealthRow extends ProfileLink {
  status: LinkStatus | 'UNCHECKED';
  httpStatus: number | null;
  reason: string | null;
  checkedAt: Date | null;
}

/**
 * WhatsApp and phone numbers are deliberately absent.
 *
 * `wa.me/<number>` answers 200 for a number nobody owns, so a check would
 * report "working" for a link that goes nowhere useful — worse than not
 * checking, because it looks like it was verified.
 */
const SOCIAL_FIELDS = [
  ['website', 'Website'],
  ['instagram', 'Instagram'],
  ['tiktok', 'TikTok'],
  ['facebook', 'Facebook'],
  ['linkedin', 'LinkedIn'],
  ['youtube', 'YouTube'],
  ['googleMapsUrl', 'Google Maps'],
] as const;

/** Everything the platform publishes for a business that points outward. */
export async function listProfileLinks(businessId: string): Promise<ProfileLink[]> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      website: true,
      instagram: true,
      tiktok: true,
      facebook: true,
      linkedin: true,
      youtube: true,
      googleMapsUrl: true,
      publicFiles: {
        where: { kind: 'LINK' },
        select: { key: true, titleAr: true, titleEn: true, externalUrl: true },
      },
      offers: {
        where: { ctaUrl: { not: null } },
        select: { key: true, titleAr: true, titleEn: true, ctaUrl: true },
      },
    },
  });

  if (!business) return [];

  const links: ProfileLink[] = [];

  for (const [field, label] of SOCIAL_FIELDS) {
    const url = business[field];
    if (url) links.push({ field, label, url });
  }

  for (const file of business.publicFiles) {
    if (file.externalUrl) {
      links.push({
        field: `file:${file.key}`,
        label: file.titleEn ?? file.titleAr,
        url: file.externalUrl,
      });
    }
  }

  for (const offer of business.offers) {
    if (offer.ctaUrl) {
      links.push({
        field: `offer:${offer.key}`,
        label: `${offer.titleEn ?? offer.titleAr} (offer link)`,
        url: offer.ctaUrl,
      });
    }
  }

  // The same URL published in two places is one address to check.
  const seen = new Set<string>();
  return links.filter((link) => (seen.has(link.url) ? false : (seen.add(link.url), true)));
}

/**
 * Current state of every link, joined to whatever was last found out about it.
 *
 * A link with no row is `UNCHECKED`, not `WORKING`. Reporting an unverified
 * link as healthy is the one thing this feature must not do.
 */
export async function getLinkHealth(
  user: AuthenticatedUser,
  businessId: string,
): Promise<LinkHealthRow[]> {
  const context = await requireTenantContext(user, businessId, 'VIEWER');

  const [links, checks] = await Promise.all([
    listProfileLinks(context.businessId),
    prisma.linkCheck.findMany({ where: { businessId: context.businessId } }),
  ]);

  const byUrl = new Map(checks.map((check) => [check.url, check]));

  return links.map((link) => {
    const check = byUrl.get(link.url);

    return {
      ...link,
      status: check?.status ?? 'UNCHECKED',
      httpStatus: check?.httpStatus ?? null,
      reason: check?.reason ?? null,
      checkedAt: check?.checkedAt ?? null,
    };
  });
}

/** Upper bound on one run, so a business with a long file list cannot hang a request. */
const MAX_LINKS_PER_RUN = 24;

/**
 * Probes every link and records the result.
 *
 * Sequential on purpose. The parallel version is faster and turns the platform
 * into a small amplifier: one operator clicking a button becomes twenty
 * simultaneous outbound requests, which is how link checkers end up in
 * abuse reports.
 */
export async function checkLinks(
  user: AuthenticatedUser,
  businessId: string,
): Promise<LinkHealthRow[]> {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  const links = (await listProfileLinks(context.businessId)).slice(0, MAX_LINKS_PER_RUN);

  const rows: LinkHealthRow[] = [];

  for (const link of links) {
    const result = await probeLink(link.url);

    const stored = await prisma.linkCheck.upsert({
      where: { businessId_url: { businessId: context.businessId, url: link.url } },
      update: { status: result.status, httpStatus: result.httpStatus, reason: result.reason, checkedAt: new Date() },
      create: {
        businessId: context.businessId,
        url: link.url,
        status: result.status,
        httpStatus: result.httpStatus,
        reason: result.reason,
      },
    });

    rows.push({
      ...link,
      status: stored.status,
      httpStatus: stored.httpStatus,
      reason: stored.reason,
      checkedAt: stored.checkedAt,
    });
  }

  // Addresses the business no longer publishes stop being reported.
  const current = links.map((link) => link.url);
  await prisma.linkCheck.deleteMany({
    where: { businessId: context.businessId, url: { notIn: current.length ? current : [''] } },
  });

  await recordAudit({
    action: 'links.checked',
    entity: 'business',
    entityId: context.businessId,
    businessId: context.businessId,
    userId: user.id,
    metadata: {
      checked: rows.length,
      broken: rows.filter((row) => row.status === 'BROKEN').length,
      blocked: rows.filter((row) => row.status === 'BLOCKED').length,
    },
  });

  return rows;
}
