'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/current-user';
import { prisma } from '@/server/db/client';
import { invalidateProfile } from '@/server/profile/cache';
import { recordAudit } from '@/server/audit/log';
import {
  requireTenantContext,
  tenantScope,
  TenantAccessError,
  type TenantContext,
} from '@/server/tenancy/context';
import { parsePriceToMinor } from '@/lib/money';
import { ValidationError } from './business-service';
import type { ActionState } from './actions';

/**
 * Emergency mode (master spec §21, §22, §166).
 *
 * The operator targets are the design brief here: disable an item in under
 * five seconds, change a price in under ten, pause an offer in under fifteen.
 * None of those was reachable, because each meant navigating to a business,
 * then a menu, then finding a row, then opening a form.
 *
 * So these actions take the smallest arguments that can identify the thing and
 * do exactly one job each. They are separate from the menu editor's actions on
 * purpose: that editor writes every field of an item, which is the wrong tool
 * during service, when the only question is whether the kitchen has run out.
 *
 * Everything still goes through the tenant guard, still writes an audit entry,
 * and still invalidates the public profile. Fast does not mean unaccountable.
 */

async function withBusiness<T>(
  businessId: string,
  minimumRole: 'EDITOR' | 'MANAGER',
  work: (context: TenantContext & { userId: string }, publicId: string) => Promise<T>,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const context = await requireTenantContext(user, businessId, minimumRole);

    const business = await prisma.business.findUniqueOrThrow({
      where: { id: context.businessId },
      select: { publicId: true },
    });

    const message = await work({ ...context, userId: user.id }, business.publicId);

    revalidatePath(`/admin/businesses/${businessId}/quick`);
    revalidatePath(`/m/${business.publicId}`);
    invalidateProfile(business.publicId);

    return { ok: true, message: String(message) };
  } catch (error) {
    if (error instanceof TenantAccessError) return { error: 'Not found' };
    if (error instanceof ValidationError) return { error: error.message };
    console.error('[quick] action failed', error);
    return { error: 'Something went wrong' };
  }
}

/** One tap. The single most common urgent change in a restaurant. */
export async function toggleItemAvailabilityAction(
  businessId: string,
  itemCode: string,
): Promise<ActionState> {
  return withBusiness(businessId, 'EDITOR', async (context) => {
    const item = await prisma.menuItem.findFirst({
      where: { itemCode, ...tenantScope(context) },
      select: { id: true, availability: true, nameAr: true, nameEn: true },
    });

    if (!item) throw new ValidationError('Item not found');

    const next = item.availability === 'UNAVAILABLE' ? 'AVAILABLE' : 'UNAVAILABLE';

    await prisma.menuItem.update({ where: { id: item.id }, data: { availability: next } });

    await recordAudit({
      action: 'item.updated',
      entity: 'menu_item',
      entityId: item.id,
      businessId: context.businessId,
      userId: context.userId,
      metadata: { itemCode, availability: { from: item.availability, to: next } },
    });

    return next === 'UNAVAILABLE'
      ? `${item.nameEn ?? item.nameAr} marked unavailable`
      : `${item.nameEn ?? item.nameAr} is back`;
  });
}

/** A price, typed and submitted, with history recorded exactly as elsewhere. */
export async function quickPriceAction(
  businessId: string,
  itemCode: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withBusiness(businessId, 'EDITOR', async (context) => {
    const raw = String(formData.get('price') ?? '').trim();

    const business = await prisma.business.findUniqueOrThrow({
      where: { id: context.businessId },
      select: { currency: true },
    });

    const priceMinor = raw === '' ? null : parsePriceToMinor(raw, business.currency);
    if (raw !== '' && priceMinor === null) {
      throw new ValidationError(`Could not read the price "${raw}"`);
    }

    const item = await prisma.menuItem.findFirst({
      where: { itemCode, ...tenantScope(context) },
      select: { id: true, priceMinor: true, nameAr: true, nameEn: true },
    });

    if (!item) throw new ValidationError('Item not found');
    if (item.priceMinor === priceMinor) return 'That is already the price';

    await prisma.menuItem.update({ where: { id: item.id }, data: { priceMinor } });

    await prisma.priceHistory.create({
      data: {
        businessId: context.businessId,
        itemId: item.id,
        itemCode,
        oldPriceMinor: item.priceMinor,
        newPriceMinor: priceMinor,
        currency: business.currency,
        changedById: context.userId,
      },
    });

    await recordAudit({
      action: 'item.price_changed',
      entity: 'menu_item',
      entityId: item.id,
      businessId: context.businessId,
      userId: context.userId,
      metadata: {
        itemCode,
        from: item.priceMinor,
        to: priceMinor,
        currency: business.currency,
      },
    });

    return `${item.nameEn ?? item.nameAr} is now ${raw || 'unpriced'}`;
  });
}

/** Pausing an offer mid-service, without editing its schedule. */
export async function toggleOfferAction(
  businessId: string,
  offerKey: string,
): Promise<ActionState> {
  return withBusiness(businessId, 'EDITOR', async (context) => {
    const offer = await prisma.offer.findFirst({
      where: { key: offerKey, ...tenantScope(context) },
      select: { id: true, isActive: true, titleAr: true, titleEn: true },
    });

    if (!offer) throw new ValidationError('Offer not found');

    await prisma.offer.update({
      where: { id: offer.id },
      data: { isActive: !offer.isActive },
    });

    await recordAudit({
      action: 'offer.updated',
      entity: 'offer',
      entityId: offer.id,
      businessId: context.businessId,
      userId: context.userId,
      metadata: { key: offerKey, isActive: { from: offer.isActive, to: !offer.isActive } },
    });

    return offer.isActive
      ? `${offer.titleEn ?? offer.titleAr} paused`
      : `${offer.titleEn ?? offer.titleAr} live again`;
  });
}

/** Contact details change during service more often than anything else. */
export async function quickContactAction(
  businessId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withBusiness(businessId, 'MANAGER', async (context) => {
    const read = (name: string) => {
      const value = formData.get(name);
      const text = typeof value === 'string' ? value.trim() : '';
      return text === '' ? null : text;
    };

    const phone = read('phone');
    const whatsapp = read('whatsapp');

    for (const [label, value] of [
      ['Phone', phone],
      ['WhatsApp', whatsapp],
    ] as const) {
      if (value && !/^\+?[\d\s()-]{6,20}$/.test(value)) {
        throw new ValidationError(`${label} does not look like a number`);
      }
    }

    const before = await prisma.business.findUniqueOrThrow({
      where: { id: context.businessId },
      select: { phone: true, whatsapp: true },
    });

    await prisma.business.update({
      where: { id: context.businessId },
      data: { phone, whatsapp },
    });

    await recordAudit({
      action: 'business.updated',
      entity: 'business',
      entityId: context.businessId,
      businessId: context.businessId,
      userId: context.userId,
      metadata: {
        phone: { from: before.phone, to: phone },
        whatsapp: { from: before.whatsapp, to: whatsapp },
      },
    });

    return 'Contact numbers updated';
  });
}
