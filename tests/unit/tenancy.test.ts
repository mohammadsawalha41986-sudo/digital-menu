import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tenant isolation is the security property most likely to be quietly broken
 * by a future change, so it is tested at the unit level against a mocked data
 * layer: the assertions are about *which query is issued*, which is exactly
 * what a regression would alter.
 */

const findUniqueBusiness = vi.fn();
const findUniqueMembership = vi.fn();

vi.mock('@/server/db/client', () => ({
  prisma: {
    business: { findUnique: (args: unknown) => findUniqueBusiness(args) },
    businessMembership: { findUnique: (args: unknown) => findUniqueMembership(args) },
  },
}));

const { TenantAccessError, requireTenantContext, resolveTenantContext, roleAtLeast, tenantScope } =
  await import('@/server/tenancy/context');

const STAFF = { id: 'user_staff', role: 'STAFF' } as const;
const SUPER_ADMIN = { id: 'user_root', role: 'SUPER_ADMIN' } as const;

beforeEach(() => {
  findUniqueBusiness.mockReset();
  findUniqueMembership.mockReset();
});

describe('resolveTenantContext', () => {
  it('grants access when the user holds a membership', async () => {
    findUniqueMembership.mockResolvedValue({ businessId: 'biz_a', role: 'EDITOR' });

    const context = await resolveTenantContext(STAFF, 'biz_a');

    expect(context).toEqual({
      userId: 'user_staff',
      businessId: 'biz_a',
      role: 'EDITOR',
      viaPlatformRole: false,
    });
    // The membership is looked up by (user, business) — never by business alone.
    expect(findUniqueMembership).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_businessId: { userId: 'user_staff', businessId: 'biz_a' } },
      }),
    );
  });

  it('denies a business the user has no membership for', async () => {
    findUniqueMembership.mockResolvedValue(null);

    // The tenant id came from the request and is worthless without a grant.
    expect(await resolveTenantContext(STAFF, 'biz_someone_elses')).toBeNull();
  });

  it('denies rather than distinguishing "forbidden" from "missing"', async () => {
    findUniqueMembership.mockResolvedValue(null);
    findUniqueBusiness.mockResolvedValue(null);

    expect(await resolveTenantContext(STAFF, 'biz_nonexistent')).toBeNull();
    expect(await resolveTenantContext(SUPER_ADMIN, 'biz_nonexistent')).toBeNull();
  });

  it('lets a platform super admin act with owner authority on an existing business', async () => {
    findUniqueBusiness.mockResolvedValue({ id: 'biz_a' });

    const context = await resolveTenantContext(SUPER_ADMIN, 'biz_a');

    expect(context).toMatchObject({ businessId: 'biz_a', role: 'OWNER', viaPlatformRole: true });
    // A super admin bypasses membership, never the existence check.
    expect(findUniqueMembership).not.toHaveBeenCalled();
  });
});

describe('requireTenantContext', () => {
  it('throws when there is no grant', async () => {
    findUniqueMembership.mockResolvedValue(null);
    await expect(requireTenantContext(STAFF, 'biz_a')).rejects.toBeInstanceOf(TenantAccessError);
  });

  it('enforces a minimum role', async () => {
    findUniqueMembership.mockResolvedValue({ businessId: 'biz_a', role: 'VIEWER' });

    await expect(requireTenantContext(STAFF, 'biz_a', 'MANAGER')).rejects.toBeInstanceOf(
      TenantAccessError,
    );
    await expect(requireTenantContext(STAFF, 'biz_a', 'VIEWER')).resolves.toMatchObject({
      role: 'VIEWER',
    });
  });

  it('carries no detail that would confirm a business exists', async () => {
    findUniqueMembership.mockResolvedValue(null);

    await expect(requireTenantContext(STAFF, 'biz_secret')).rejects.toThrow(
      /^(?!.*biz_secret).*$/s,
    );
  });
});

describe('role ranking', () => {
  it('orders roles least to most privileged', () => {
    expect(roleAtLeast('OWNER', 'VIEWER')).toBe(true);
    expect(roleAtLeast('MANAGER', 'EDITOR')).toBe(true);
    expect(roleAtLeast('EDITOR', 'MANAGER')).toBe(false);
    expect(roleAtLeast('VIEWER', 'EDITOR')).toBe(false);
  });
});

describe('tenantScope', () => {
  it('produces a where clause from the verified context, not a raw id', () => {
    const scope = tenantScope({
      userId: 'user_staff',
      businessId: 'biz_a',
      role: 'EDITOR',
      viaPlatformRole: false,
    });

    expect(scope).toEqual({ businessId: 'biz_a' });
  });
});
