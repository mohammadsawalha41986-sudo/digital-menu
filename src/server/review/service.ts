import { prisma } from '@/server/db/client';
import { recordAudit } from '@/server/audit/log';
import { requireTenantContext, tenantScope, type AuthenticatedUser } from '@/server/tenancy/context';
import { ValidationError } from '@/server/admin/business-service';
import { issueToken, parseToken, secretMatches } from './tokens';

/**
 * Client preview and approval (master spec §71–§73, §139, §140).
 *
 * The managed-service workflow's missing half. Staff could preview a profile,
 * but only behind a login — so "send it to the client for approval", the step
 * the business model turns on, had no mechanism at all.
 *
 * The client needs no account, no password and no dashboard. They get a link.
 * The link expires, can be revoked, and shows a *draft* — it is not a way to
 * make an unpublished business public, and every guard below exists to keep it
 * from becoming one.
 */

const MAX_DAYS = 90;
const DEFAULT_DAYS = 14;

export interface PreviewLinkView {
  id: string;
  key: string;
  recipientNote: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  state: 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED';
  respondedAt: Date | null;
  responseNote: string | null;
  respondedBy: string | null;
  viewCount: number;
  lastViewed: Date | null;
  createdAt: Date;
  createdBy: string | null;
  isExpired: boolean;
  isUsable: boolean;
}

function toView(row: {
  id: string;
  key: string;
  recipientNote: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  state: 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED';
  respondedAt: Date | null;
  responseNote: string | null;
  respondedBy: string | null;
  viewCount: number;
  lastViewed: Date | null;
  createdAt: Date;
  createdBy: { name: string } | null;
}): PreviewLinkView {
  const isExpired = row.expiresAt.getTime() <= Date.now();

  return {
    ...row,
    createdBy: row.createdBy?.name ?? null,
    isExpired,
    isUsable: !isExpired && row.revokedAt === null,
  };
}

export async function createPreviewLink(
  user: AuthenticatedUser,
  businessId: string,
  input: { recipientNote?: string | null; days?: number },
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const days = Math.min(Math.max(Math.round(input.days ?? DEFAULT_DAYS), 1), MAX_DAYS);
  const issued = issueToken();

  const link = await prisma.previewLink.create({
    data: {
      businessId: context.businessId,
      key: issued.key,
      tokenHash: issued.tokenHash,
      recipientNote: input.recipientNote?.trim() || null,
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      createdById: user.id,
    },
    select: { id: true, key: true, expiresAt: true },
  });

  await recordAudit({
    action: 'preview.link_created',
    entity: 'preview_link',
    entityId: link.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { expiresAt: link.expiresAt.toISOString(), days },
  });

  // The full token is returned exactly once. It is not stored, so a staff
  // member who loses it issues a new link rather than recovering this one.
  return { link, token: issued.token };
}

export async function revokePreviewLink(
  user: AuthenticatedUser,
  businessId: string,
  linkId: string,
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const result = await prisma.previewLink.updateMany({
    where: { id: linkId, ...tenantScope(context) },
    data: { revokedAt: new Date() },
  });

  if (result.count === 0) throw new ValidationError('Preview link not found');

  await recordAudit({
    action: 'preview.link_revoked',
    entity: 'preview_link',
    entityId: linkId,
    businessId: context.businessId,
    userId: user.id,
  });
}

export async function listPreviewLinks(
  user: AuthenticatedUser,
  businessId: string,
): Promise<PreviewLinkView[]> {
  const context = await requireTenantContext(user, businessId, 'VIEWER');

  const links = await prisma.previewLink.findMany({
    where: tenantScope(context),
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      key: true,
      recipientNote: true,
      expiresAt: true,
      revokedAt: true,
      state: true,
      respondedAt: true,
      responseNote: true,
      respondedBy: true,
      viewCount: true,
      lastViewed: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
  });

  return links.map(toView);
}

/**
 * Resolves a token from a preview URL.
 *
 * Returns null for every failure — unknown key, wrong secret, expired,
 * revoked — because distinguishing them tells whoever is guessing which half
 * they got right.
 */
export async function resolvePreviewToken(token: string) {
  const parsed = parseToken(token);
  if (!parsed) return null;

  const link = await prisma.previewLink.findUnique({
    where: { key: parsed.key },
    select: {
      id: true,
      businessId: true,
      tokenHash: true,
      expiresAt: true,
      revokedAt: true,
      state: true,
      business: { select: { publicId: true, nameAr: true, nameEn: true } },
    },
  });

  if (!link) return null;
  if (!secretMatches(parsed.secret, link.tokenHash)) return null;
  if (link.revokedAt !== null) return null;
  if (link.expiresAt.getTime() <= Date.now()) return null;

  return link;
}

/** Counts a view. Best-effort: a failed count must never break the page. */
export async function recordPreviewView(linkId: string) {
  await prisma.previewLink
    .update({
      where: { id: linkId },
      data: { viewCount: { increment: 1 }, lastViewed: new Date() },
    })
    .catch(() => undefined);
}

/**
 * The client's decision (§72, §140).
 *
 * `respondedBy` is self-declared and stored as such: the link is the only
 * credential, so a name typed into a box is a courtesy for the record, never
 * authentication, and nothing downstream may treat it as one.
 */
export async function respondToPreview(
  token: string,
  input: { approve: boolean; note?: string | null; name?: string | null },
) {
  const link = await resolvePreviewToken(token);
  if (!link) return null;

  const note = input.note?.trim().slice(0, 4000) || null;

  if (!input.approve && !note) {
    throw new ValidationError('Please describe the change you would like');
  }

  await prisma.$transaction(async (tx) => {
    await tx.previewLink.update({
      where: { id: link.id },
      data: {
        state: input.approve ? 'APPROVED' : 'CHANGES_REQUESTED',
        respondedAt: new Date(),
        responseNote: note,
        respondedBy: input.name?.trim().slice(0, 200) || null,
      },
    });

    if (!input.approve && note) {
      await tx.changeRequest.create({
        data: { businessId: link.businessId, previewLinkId: link.id, body: note },
      });
    }
  });

  await recordAudit({
    action: input.approve ? 'preview.approved' : 'preview.changes_requested',
    entity: 'preview_link',
    entityId: link.id,
    businessId: link.businessId,
    // No userId: a client is not a user of this system.
    metadata: { respondedBy: input.name?.slice(0, 200) ?? null },
  });

  return { approved: input.approve };
}

/* --- Change requests ------------------------------------------------------ */

export async function listChangeRequests(user: AuthenticatedUser, businessId: string) {
  const context = await requireTenantContext(user, businessId, 'VIEWER');

  return prisma.changeRequest.findMany({
    where: tenantScope(context),
    orderBy: [{ isDone: 'asc' }, { createdAt: 'desc' }],
    take: 100,
    select: {
      id: true,
      body: true,
      isDone: true,
      completedAt: true,
      createdAt: true,
      completedBy: { select: { name: true } },
    },
  });
}

export async function addChangeRequest(
  user: AuthenticatedUser,
  businessId: string,
  body: string,
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const text = body.trim();
  if (!text) throw new ValidationError('Write what the client asked for');

  return prisma.changeRequest.create({
    data: { businessId: context.businessId, body: text.slice(0, 4000) },
    select: { id: true },
  });
}

export async function setChangeRequestDone(
  user: AuthenticatedUser,
  businessId: string,
  requestId: string,
  isDone: boolean,
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const result = await prisma.changeRequest.updateMany({
    where: { id: requestId, ...tenantScope(context) },
    data: {
      isDone,
      completedAt: isDone ? new Date() : null,
      completedById: isDone ? user.id : null,
    },
  });

  if (result.count === 0) throw new ValidationError('Change request not found');
}
