import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/server/auth/current-user';
import { resolveTenantContext } from '@/server/tenancy/context';
import { prisma } from '@/server/db/client';
import { recordAudit } from '@/server/audit/log';
import { renderQr, renderQrPng, type QrArtwork } from '@/server/qr/service';

/**
 * QR download.
 *
 * A route handler rather than a server action because the response is a file.
 * Authorization is identical to every other admin path: authenticate, resolve
 * a tenant grant for the requested business, then act. The business id in the
 * URL is a request, not a grant (master spec §128).
 */

const ARTWORKS: QrArtwork[] = ['plain', 'with-logo', 'with-name', 'with-prompt'];

export async function GET(
  request: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { businessId } = await context.params;
  const tenant = await resolveTenantContext(user, businessId);

  // Missing and forbidden are the same answer.
  if (!tenant) return new NextResponse(null, { status: 404 });

  const business = await prisma.business.findUnique({
    where: { id: tenant.businessId },
    select: { publicId: true, nameAr: true, nameEn: true },
  });

  if (!business) return new NextResponse(null, { status: 404 });

  const url = new URL(request.url);
  const format = url.searchParams.get('format') === 'png' ? 'png' : 'svg';
  const requestedArtwork = url.searchParams.get('artwork') ?? 'plain';
  const artwork = ARTWORKS.includes(requestedArtwork as QrArtwork)
    ? (requestedArtwork as QrArtwork)
    : 'plain';
  const branchParam = url.searchParams.get('branch');

  // A branch key from the query is only honoured if it belongs to this tenant.
  const branchKey = branchParam
    ? ((
        await prisma.branch.findFirst({
          where: { key: branchParam, businessId: tenant.businessId },
          select: { key: true },
        })
      )?.key ?? null)
    : null;

  const name = business.nameEn ?? business.nameAr;
  const filename = `qr-${business.publicId}${branchKey ? `-${branchKey}` : ''}-${artwork}.${format}`;

  await recordAudit({
    action: 'qr.generated',
    entity: 'business',
    entityId: tenant.businessId,
    businessId: tenant.businessId,
    userId: user.id,
    metadata: { artwork, format, branchKey },
  });

  if (format === 'png') {
    // PNG carries the bare symbol: raster compositing would need a canvas
    // dependency, and print workflows want the vector for artwork anyway.
    const png = await renderQrPng({ publicId: business.publicId, branchKey });

    return new NextResponse(new Uint8Array(png), {
      headers: {
        'content-type': 'image/png',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    });
  }

  const { svg } = await renderQr({
    publicId: business.publicId,
    branchKey,
    artwork,
    captionPrimary: artwork === 'plain' ? null : name,
    captionSecondary: artwork === 'with-prompt' ? 'Scan to view the menu' : null,
  });

  return new NextResponse(svg, {
    headers: {
      'content-type': 'image/svg+xml',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
