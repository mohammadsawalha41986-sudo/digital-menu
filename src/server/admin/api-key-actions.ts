'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSuperAdmin } from '@/server/auth/current-user';
import { prisma } from '@/server/db/client';
import { generateApiToken } from '@/server/api/auth';
import { recordAudit } from '@/server/audit/log';
import { formDataToObject } from './validation';
import type { ActionState } from './actions';

/**
 * API key management.
 *
 * Platform-level, so it requires a super admin rather than a tenant grant:
 * issuing a key that can read several businesses is not something a
 * single-business operator should be able to do.
 */

export interface ApiKeyState extends ActionState {
  /** Shown once, immediately after issuing. Never retrievable afterwards. */
  token?: string;
}

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  businessPublicIds: z.string().trim().max(2000).optional().default(''),
  marketingClientId: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => value || null),
  expiresAt: z.string().trim().optional().transform((value) => value || null),
});

export async function createApiKeyAction(
  _previous: ApiKeyState,
  formData: FormData,
): Promise<ApiKeyState> {
  const user = await requireSuperAdmin();

  const parsed = schema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  // Scope is entered as public ids — the identifier staff actually know — and
  // resolved to internal ids here. An unknown id fails the whole request
  // rather than silently issuing a key with a narrower scope than intended.
  const publicIds = parsed.data.businessPublicIds
    .split(/[\s,]+/)
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  let businessIds: string[] = [];

  if (publicIds.length > 0) {
    const businesses = await prisma.business.findMany({
      where: { publicId: { in: publicIds } },
      select: { id: true, publicId: true },
    });

    const found = new Set(businesses.map((business) => business.publicId));
    const missing = publicIds.filter((id) => !found.has(id));

    if (missing.length > 0) {
      return { error: `Unknown public id: ${missing.join(', ')}` };
    }

    businessIds = businesses.map((business) => business.id);
  }

  const issued = generateApiToken();

  const client = await prisma.apiClient.create({
    data: {
      name: parsed.data.name,
      tokenPrefix: issued.prefix,
      tokenHash: issued.hash,
      businessIds,
      marketingClientId: parsed.data.marketingClientId,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    },
  });

  await recordAudit({
    action: 'business.updated',
    entity: 'api_client',
    entityId: client.id,
    userId: user.id,
    metadata: { name: client.name, scopedTo: publicIds.length || 'platform-wide' },
  });

  revalidatePath('/admin/api-keys');

  return {
    ok: true,
    message: 'Key created. Copy it now — it cannot be shown again.',
    token: issued.token,
  };
}

export async function revokeApiKeyAction(clientId: string): Promise<ActionState> {
  const user = await requireSuperAdmin();

  // Revoked rather than deleted: the audit trail should keep referring to a
  // key that existed.
  await prisma.apiClient.update({ where: { id: clientId }, data: { isActive: false } });

  await recordAudit({
    action: 'business.updated',
    entity: 'api_client',
    entityId: clientId,
    userId: user.id,
    metadata: { revoked: true },
  });

  revalidatePath('/admin/api-keys');
  return { ok: true, message: 'Key revoked' };
}
