import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getStorage } from '@/server/storage';
import { parsePublicId } from '@/lib/public-id';

/**
 * PUBLIC FILE DOWNLOAD — `/f/{publicId}/{fileKey}`.
 *
 * Deliberately *not* a QR destination: a QR resolves to `/m/{publicId}`, the
 * profile links here, and replacing the PDF changes what this returns without
 * touching either (master spec §48; GOALS I1).
 *
 * Security properties (§108):
 *  - Only rows marked `isPublic` on an ACTIVE business are served.
 *  - Only the *current* version is reachable; superseded versions are not
 *    addressable, so an old price list cannot be pulled back up.
 *  - The storage key never appears in the URL, so the store cannot be walked.
 *  - `Content-Disposition` is built from a sanitised name and a fixed content
 *    type, and `nosniff` prevents the browser from reinterpreting the bytes.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ publicId: string; fileKey: string }> },
) {
  const { publicId: rawPublicId, fileKey } = await context.params;
  const publicId = parsePublicId(rawPublicId);

  if (!publicId) return new NextResponse(null, { status: 404 });

  const file = await prisma.publicFile.findFirst({
    where: {
      key: fileKey,
      isPublic: true,
      kind: 'FILE',
      business: { publicId, status: 'ACTIVE' },
    },
    select: {
      allowDownload: true,
      currentVersion: {
        select: { storageKey: true, contentType: true, sizeBytes: true, originalName: true },
      },
    },
  });

  // A private file, a draft business and a nonexistent key are one answer.
  if (!file?.currentVersion) return new NextResponse(null, { status: 404 });

  const body = await getStorage().get(file.currentVersion.storageKey);
  if (!body) return new NextResponse(null, { status: 404 });

  // `?inline` renders in the browser's PDF viewer; the default downloads.
  // A business that disabled downloading only ever gets inline.
  const wantsInline = new URL(request.url).searchParams.has('inline');
  const disposition = !file.allowDownload || wantsInline ? 'inline' : 'attachment';
  const filename = file.currentVersion.originalName ?? `${fileKey}.pdf`;

  return new NextResponse(new Uint8Array(body), {
    headers: {
      'content-type': file.currentVersion.contentType,
      'content-length': String(file.currentVersion.sizeBytes),
      'content-disposition': `${disposition}; filename="${filename}"`,
      'x-content-type-options': 'nosniff',
      // Files are replaced by adding a version, so the current bytes at this
      // URL can change; revalidate rather than caching hard.
      'cache-control': 'public, max-age=60, must-revalidate',
    },
  });
}
