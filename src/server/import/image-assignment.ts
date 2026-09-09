import { prisma } from '@/server/db/client';
import { assignMedia, uploadMedia } from '@/server/media/service';
import type { AuthenticatedUser } from '@/server/tenancy/context';
import { normalizeItemCode, type ImageZipEntry } from './image-zip';

export interface ImageAssignmentPlan {
  /** Archive entries whose basename matches an item this business owns. */
  matched: { entry: ImageZipEntry; itemCode: string; hadImage: boolean }[];
  /** Entries naming an item_id this business does not have. */
  unmatched: { fileName: string; itemCode: string }[];
}

export interface ImageAssignmentReport {
  /** Items that had no photograph and now have one. */
  created: number;
  /** Items whose existing photograph was replaced. */
  replaced: number;
  /** Archive entries with no matching item_id. Their items are untouched. */
  skipped: number;
  /** Files that could not be assigned, by name. */
  failed: string[];
}

/**
 * Works out what a ZIP would do to this business's item photography.
 *
 * Read-only: the operator sees the whole plan — what will be assigned, what
 * will be replaced, what does not match anything — before any byte is stored.
 * The lookup is scoped to the business, so an item code that exists only in
 * another tenant reads as unmatched rather than reaching across.
 */
export async function planImageAssignment(
  businessId: string,
  entries: ImageZipEntry[],
): Promise<ImageAssignmentPlan> {
  const items = await prisma.menuItem.findMany({
    where: { businessId },
    select: { itemCode: true, imageMediaId: true },
  });

  const byCode = new Map(
    items.map((item) => [
      normalizeItemCode(item.itemCode),
      { itemCode: item.itemCode, hadImage: item.imageMediaId !== null },
    ]),
  );

  const matched: ImageAssignmentPlan['matched'] = [];
  const unmatched: ImageAssignmentPlan['unmatched'] = [];

  for (const entry of entries) {
    const item = byCode.get(normalizeItemCode(entry.itemCode));
    if (item) matched.push({ entry, itemCode: item.itemCode, hadImage: item.hadImage });
    else unmatched.push({ fileName: entry.fileName, itemCode: entry.itemCode });
  }

  return { matched, unmatched };
}

/**
 * Stores and assigns the planned images through the ordinary media pipeline.
 *
 * Every image goes through `uploadMedia`, so it gets the same content
 * validation, deduplication, generated storage key and derivatives as one
 * uploaded by hand — there is no second pipeline to keep in step. `assignMedia`
 * re-resolves the tenant for each write, so a code that is not this business's
 * cannot be reached even if the plan were wrong.
 *
 * There is no transaction spanning object storage and the database, so the
 * guarantee is per item: an image is uploaded *and* assigned, or that item
 * keeps exactly the photograph it already had. A file that fails costs itself
 * and nothing else, and is named in the report.
 */
export async function assignPlannedImages(
  user: AuthenticatedUser,
  businessId: string,
  plan: ImageAssignmentPlan,
): Promise<ImageAssignmentReport> {
  let created = 0;
  let replaced = 0;
  const failed: string[] = [];

  for (const { entry, itemCode, hadImage } of plan.matched) {
    try {
      const media = await uploadMedia(user, businessId, {
        kind: 'ITEM_IMAGE',
        upload: {
          fileName: entry.fileName.split('/').pop() ?? entry.fileName,
          declaredContentType: entry.contentType,
          bytes: entry.bytes,
        },
      });
      await assignMedia(user, businessId, media.id, { type: 'item', itemCode });
      if (hadImage) replaced += 1;
      else created += 1;
    } catch (error) {
      failed.push(entry.fileName);
      console.error('image-zip: assignment failed', {
        businessId,
        fileName: entry.fileName,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { created, replaced, skipped: plan.unmatched.length, failed };
}

/** One line an operator can read: what happened to every file in the archive. */
export function describeImageAssignment(report: ImageAssignmentReport): string {
  return [
    `${report.created} new`,
    `${report.replaced} replaced`,
    `${report.skipped} skipped (no matching item_id)`,
    `${report.failed.length} failed`,
  ].join(', ');
}
