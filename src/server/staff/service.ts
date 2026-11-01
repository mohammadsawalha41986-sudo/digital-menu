import { prisma } from '@/server/db/client';
import { recordAudit } from '@/server/audit/log';
import { requireTenantContext, tenantScope, type AuthenticatedUser } from '@/server/tenancy/context';
import { ValidationError } from '@/server/admin/business-service';
import { issueToken, parseToken, secretMatches } from '@/server/review/tokens';

/**
 * Staff availability links.
 *
 * A restaurant gives its own staff a link. Opening it shows the dishes and
 * lets the person mark each one available, unavailable right now, or hidden
 * from the menu. No account and no password: the link is the access, so it can
 * do nothing else. It cannot change a price, a name, a photo or a section, and
 * it reaches only the restaurant that issued it.
 *
 * The token design is the preview-link design (src/server/review/tokens.ts):
 * an unguessable secret, only its hash stored, checked on every use, and
 * revocable. A link can be revoked at any time and expires on its own.
 */

const DEFAULT_DAYS = 180;
const MAX_DAYS = 365;
const MAX_LABEL = 60;

export interface StaffLinkView {
  id: string;
  key: string;
  label: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  useCount: number;
  createdAt: Date;
  createdBy: string | null;
  isExpired: boolean;
  isUsable: boolean;
}

export async function createStaffLink(
  user: AuthenticatedUser,
  businessId: string,
  input: { label: string; days?: number },
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const label = input.label.trim();
  if (!label) throw new ValidationError('Give the link a name, such as "Front desk".');
  if (label.length > MAX_LABEL) throw new ValidationError(`Keep the name under ${MAX_LABEL} characters.`);

  const days = Math.min(Math.max(Math.round(input.days ?? DEFAULT_DAYS), 1), MAX_DAYS);
  const issued = issueToken();

  const link = await prisma.staffLink.create({
    data: {
      businessId: context.businessId,
      key: issued.key,
      tokenHash: issued.tokenHash,
      label,
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      createdById: user.id,
    },
    select: { id: true, expiresAt: true },
  });

  await recordAudit({
    action: 'staff_link.created',
    entity: 'staff_link',
    entityId: link.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { label, days, expiresAt: link.expiresAt.toISOString() },
  });

  // Returned once. The secret is not stored, so a lost link is replaced, not recovered.
  return { link, token: issued.token };
}

export async function revokeStaffLink(user: AuthenticatedUser, businessId: string, linkId: string) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const result = await prisma.staffLink.updateMany({
    where: { id: linkId, ...tenantScope(context), revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (result.count === 0) throw new ValidationError('That link was not found, or is already revoked.');

  await recordAudit({
    action: 'staff_link.revoked',
    entity: 'staff_link',
    entityId: linkId,
    businessId: context.businessId,
    userId: user.id,
  });
}

export async function listStaffLinks(user: AuthenticatedUser, businessId: string): Promise<StaffLinkView[]> {
  const context = await requireTenantContext(user, businessId, 'VIEWER');

  const links = await prisma.staffLink.findMany({
    where: tenantScope(context),
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      key: true,
      label: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      useCount: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
  });

  const now = Date.now();
  return links.map((link) => {
    const isExpired = link.expiresAt.getTime() <= now;
    return {
      id: link.id,
      key: link.key,
      label: link.label,
      expiresAt: link.expiresAt,
      revokedAt: link.revokedAt,
      lastUsedAt: link.lastUsedAt,
      useCount: link.useCount,
      createdAt: link.createdAt,
      createdBy: link.createdBy?.name ?? null,
      isExpired,
      isUsable: link.revokedAt === null && !isExpired,
    };
  });
}

/**
 * Resolves a token from a staff URL. Returns null for every failure: unknown
 * key, wrong secret, revoked, expired. Telling them apart would tell a guesser
 * which half they got right.
 */
export async function resolveStaffToken(token: string) {
  const parsed = parseToken(token);
  if (!parsed) return null;

  const link = await prisma.staffLink.findUnique({
    where: { key: parsed.key },
    select: {
      id: true,
      businessId: true,
      label: true,
      tokenHash: true,
      expiresAt: true,
      revokedAt: true,
      business: { select: { publicId: true } },
    },
  });

  if (!link) return null;
  if (!secretMatches(parsed.secret, link.tokenHash)) return null;
  if (link.revokedAt !== null) return null;
  if (link.expiresAt.getTime() <= Date.now()) return null;

  return {
    id: link.id,
    businessId: link.businessId,
    publicId: link.business.publicId,
    label: link.label,
  };
}

/** Counts a use. Best-effort: a failed count must never block a change. */
export async function recordStaffUse(linkId: string): Promise<void> {
  await prisma.staffLink
    .update({
      where: { id: linkId },
      data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
    })
    .catch(() => undefined);
}
