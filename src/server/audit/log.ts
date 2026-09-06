import { prisma } from '@/server/db/client';

/**
 * Audit trail (master spec §123).
 *
 * Every consequential staff action records who did what to which entity, with
 * before/after values for the fields that changed. Price changes matter most —
 * they are what a client disputes later — so they always carry both values.
 *
 * Writes are best-effort by design: an audit failure must not roll back the
 * business action the operator just performed. Failures are logged, not
 * thrown.
 */

export type AuditAction =
  | 'business.created'
  | 'business.updated'
  | 'business.status_changed'
  | 'business.hours_updated'
  | 'branch.created'
  | 'branch.updated'
  | 'branch.deleted'
  | 'branch.hours_updated'
  | 'brand.updated'
  | 'template.changed'
  | 'menu.created'
  | 'menu.updated'
  | 'menu.published'
  | 'menu.restored'
  | 'category.created'
  | 'category.updated'
  | 'category.deleted'
  | 'item.created'
  | 'item.updated'
  | 'item.deleted'
  | 'item.price_changed'
  | 'offer.created'
  | 'offer.updated'
  | 'offer.deleted'
  | 'file.uploaded'
  | 'file.replaced'
  | 'file.updated'
  | 'file.deleted'
  | 'qr.generated'
  | 'links.checked'
  | 'import.executed'
  | 'import.rolled_back'
  | 'export.executed'
  | 'user.created'
  | 'user.activated'
  | 'user.deactivated'
  | 'user.role_changed'
  | 'user.password_reset'
  | 'user.password_changed'
  | 'membership.granted'
  | 'membership.revoked'
  | 'preview.link_created'
  | 'preview.link_revoked'
  | 'preview.approved'
  | 'preview.changes_requested'
  | 'media.focal_set'
  | 'media.alt_set'
  | 'brand.analysed'
  | 'brand.overridden'
  | 'brand.applied'
  | 'design.updated'
  | 'modifier_group.created'
  | 'modifier_group.updated'
  | 'modifier_group.deleted'
  | 'item.modifiers_changed'
  | 'items.bulk_updated'
  | 'user.signed_in';

export interface AuditEntry {
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  businessId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        businessId: entry.businessId ?? null,
        userId: entry.userId ?? null,
        metadata: (entry.metadata ?? {}) as object,
      },
    });
  } catch (error) {
    console.error('[audit] failed to record entry', {
      action: entry.action,
      entity: entry.entity,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/**
 * Computes a compact before/after diff for audit metadata. Only changed keys
 * are recorded, so a log entry says what actually happened rather than
 * restating the whole row.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  for (const [key, next] of Object.entries(after)) {
    const previous = before[key];
    if (next !== undefined && !Object.is(previous, next)) {
      changes[key] = { from: previous ?? null, to: next };
    }
  }

  return changes;
}
