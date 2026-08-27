import { prisma } from '@/server/db/client';
import { parsePublicId } from '@/lib/public-id';
import { clientIp, deviceCategory, visitorHash } from './privacy';

/**
 * Event recording (master spec §109, §110, §112).
 *
 * Two rules shape this module:
 *
 *  1. **Never block the visitor.** A failed analytics write must not turn a
 *     scanned QR into an error page, so every failure is swallowed and logged.
 *  2. **No redirect chain.** A scan records its event during the profile
 *     render, not via a bounce through a counting endpoint (§112) — the
 *     visitor's first byte is the menu.
 */

export const EVENT_TYPES = [
  'profile_view',
  'qr_scan',
  'branch_view',
  'category_view',
  'item_view',
  'offer_view',
  'offer_cta',
  'download_click',
  'pdf_open',
  'external_menu',
  'contact_phone',
  'contact_whatsapp',
  'contact_maps',
  'social_instagram',
  'social_tiktok',
  'social_facebook',
  'social_linkedin',
  'social_youtube',
  'social_website',
  'language_switch',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

export interface RecordEventInput {
  businessId: string;
  eventType: EventType;
  branchKey?: string | null;
  targetKey?: string | null;
  locale?: string | null;
  headers: Headers;
}

export async function recordEvent(input: RecordEventInput): Promise<void> {
  try {
    const userAgent = input.headers.get('user-agent');

    await prisma.analyticsEvent.create({
      data: {
        businessId: input.businessId,
        eventType: input.eventType,
        branchKey: input.branchKey ?? null,
        // Public keys only — an internal id must never reach this table.
        targetKey: input.targetKey?.slice(0, 128) ?? null,
        device: deviceCategory(userAgent),
        locale: input.locale ?? null,
        visitorHash: visitorHash({
          ip: clientIp(input.headers),
          userAgent,
          businessId: input.businessId,
        }),
      },
    });
  } catch (error) {
    // A visitor must never see an error because a counter failed.
    console.error('[analytics] failed to record event', {
      eventType: input.eventType,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/**
 * Distinguishes a QR scan from an ordinary visit.
 *
 * A scan arrives with no referrer, because a camera app is not a web page.
 * That is a heuristic, not a certainty — a typed URL looks the same — so the
 * distinction is documented rather than presented as exact.
 */
export function looksLikeQrScan(headers: Headers): boolean {
  const referer = headers.get('referer');
  const secFetchSite = headers.get('sec-fetch-site');

  if (referer) return false;
  if (secFetchSite && secFetchSite !== 'none') return false;

  return true;
}

/**
 * Records an event addressed by public id.
 *
 * The public read model deliberately carries no internal id, so the lookup
 * happens here — off the response path, inside the deferred callback — rather
 * than widening the model or adding a query the visitor waits on.
 */
export async function recordEventByPublicId(
  input: Omit<RecordEventInput, 'businessId'> & { publicId: string },
): Promise<void> {
  const publicId = parsePublicId(input.publicId);
  if (!publicId) return;

  const business = await prisma.business.findFirst({
    where: { publicId, status: 'ACTIVE' },
    select: { id: true },
  });

  if (!business) return;

  await recordEvent({ ...input, businessId: business.id });
}
