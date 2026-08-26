import type { BusinessRole, PlatformRole } from '@/generated/prisma/enums';
import { prisma } from '@/server/db/client';

/**
 * Server-side tenant isolation (master spec §15, §128; GOALS I8).
 *
 * The access pattern every admin/API read and write must follow is:
 *
 *   authenticated user → tenant context → authorized resource
 *
 * A business id arriving from a URL, form field or JSON body is a *request*,
 * not a grant. It becomes a grant only after {@link resolveTenantContext}
 * confirms a membership row (or platform super-admin status) for the
 * authenticated user. Callers then scope every query with
 * `where: { businessId: context.businessId }`.
 *
 * Nothing in this module trusts the client, and nothing in the browser can
 * influence its outcome.
 */

export interface AuthenticatedUser {
  id: string;
  role: PlatformRole;
}

export interface TenantContext {
  readonly userId: string;
  readonly businessId: string;
  /** Effective role: a super admin acts with OWNER-level authority. */
  readonly role: BusinessRole;
  readonly viaPlatformRole: boolean;
}

export class TenantAccessError extends Error {
  constructor(message = 'Business not found or access denied') {
    super(message);
    this.name = 'TenantAccessError';
  }
}

/** Ordered least → most privileged. */
const ROLE_RANK: Record<BusinessRole, number> = {
  VIEWER: 0,
  EDITOR: 1,
  MANAGER: 2,
  OWNER: 3,
};

export function roleAtLeast(role: BusinessRole, minimum: BusinessRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/**
 * Resolves the tenant context for a requested business, or `null` when the
 * user holds no grant. Returning `null` rather than throwing lets callers
 * answer "not found" instead of "forbidden", which avoids confirming that a
 * business id exists to someone who cannot see it.
 */
export async function resolveTenantContext(
  user: AuthenticatedUser,
  requestedBusinessId: string,
): Promise<TenantContext | null> {
  if (user.role === 'SUPER_ADMIN') {
    const business = await prisma.business.findUnique({
      where: { id: requestedBusinessId },
      select: { id: true },
    });

    if (!business) return null;

    return {
      userId: user.id,
      businessId: business.id,
      role: 'OWNER',
      viaPlatformRole: true,
    };
  }

  const membership = await prisma.businessMembership.findUnique({
    where: { userId_businessId: { userId: user.id, businessId: requestedBusinessId } },
    select: { businessId: true, role: true },
  });

  if (!membership) return null;

  return {
    userId: user.id,
    businessId: membership.businessId,
    role: membership.role,
    viaPlatformRole: false,
  };
}

/** Throwing variant for call sites that treat missing access as an error. */
export async function requireTenantContext(
  user: AuthenticatedUser,
  requestedBusinessId: string,
  minimumRole: BusinessRole = 'VIEWER',
): Promise<TenantContext> {
  const context = await resolveTenantContext(user, requestedBusinessId);

  if (!context || !roleAtLeast(context.role, minimumRole)) {
    throw new TenantAccessError();
  }

  return context;
}

/**
 * The only sanctioned way to build a tenant-scoped `where` clause. Taking the
 * context (never a raw id) makes an unscoped query visible in review.
 */
export function tenantScope(context: TenantContext): { businessId: string } {
  return { businessId: context.businessId };
}
