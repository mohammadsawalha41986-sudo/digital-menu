import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/server/auth/current-user';
import { resolveTenantContext } from '@/server/tenancy/context';
import { prisma } from '@/server/db/client';
import { recordAudit } from '@/server/audit/log';
import { renderPrintKit } from '@/server/qr/print-kit';
import { renderQrPng } from '@/server/qr/service';
import { createZip } from '@/server/qr/zip';

/**
 * One-click QR kit (master spec §123, §124).
 *
 * Everything a restaurant needs to put a code on a table, a counter, a window
 * and a wall, in one download. Authorization is identical to every other admin
 * path: the business id in the URL is a request, not a grant (§128).
 */

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { businessId } = await context.params;
  const tenant = await resolveTenantContext(user, businessId);
  if (!tenant) return new NextResponse(null, { status: 404 });

  const business = await prisma.business.findUnique({
    where: { id: tenant.businessId },
    select: { publicId: true, nameAr: true, nameEn: true, brandTheme: true },
  });

  if (!business) return new NextResponse(null, { status: 404 });

  const url = new URL(request.url);
  const branchParam = url.searchParams.get('branch');

  // A branch key from the query is honoured only if it belongs to this tenant.
  const branch = branchParam
    ? await prisma.branch.findFirst({
        where: { key: branchParam, businessId: tenant.businessId },
        select: { key: true, nameAr: true, nameEn: true },
      })
    : null;

  const name = branch
    ? `${business.nameEn ?? business.nameAr} — ${branch.nameEn ?? branch.nameAr}`
    : (business.nameEn ?? business.nameAr);

  const base = {
    publicId: business.publicId,
    branchKey: branch?.key ?? null,
    businessName: name,
    promptAr: 'امسح لعرض القائمة',
    promptEn: 'Scan to view the menu',
  };

  // Brand colours first — a kit that looks like the business is the point.
  const branded = await renderPrintKit({
    ...base,
    foreground: symbolColour(business.brandTheme?.colorText),
    background: symbolColour(business.brandTheme?.colorBackground, '#FFFFFF'),
  });

  // …but only if the result actually scans. A code that does not scan is not
  // a brand asset, and this kit goes to a printer, where the mistake becomes
  // a thousand cards. Falling back is silent to the file but stated in the
  // README, so nobody is left wondering why the print is black.
  const usedBrandColours = branded.symbol.validation.ok;

  const { symbol, pieces } = usedBrandColours
    ? branded
    : await renderPrintKit({ ...base, foreground: '#000000', background: '#FFFFFF' });

  const png = await renderQrPng({
    publicId: business.publicId,
    branchKey: branch?.key ?? null,
    sizePx: 2048,
  });

  const suffix = branch ? `-${branch.key}` : '';

  const files = [
    ...pieces.map((piece) => ({
      name: `${piece.key}-${piece.widthMm}x${piece.heightMm}mm.svg`,
      content: piece.svg,
    })),
    { name: `qr-symbol${suffix}.svg`, content: symbol.svg },
    { name: `qr-symbol${suffix}-2048.png`, content: png },
    {
      name: 'README.txt',
      content: [
        `QR kit — ${name}`,
        '',
        `Every file in this kit encodes exactly one address:`,
        `  ${symbol.destination}`,
        '',
        'That address is permanent. Changing prices, photographs, the menu, the',
        'PDF, the template or the brand changes what a visitor sees and never',
        'changes this code, so printed material stays valid indefinitely.',
        '',
        'Sizes are set in millimetres, so each file prints at its finished size',
        'without scaling:',
        '',
        ...pieces.map(
          (piece) => `  ${piece.label.padEnd(16)} ${piece.widthMm}×${piece.heightMm} mm — ${piece.description}`,
        ),
        '',
        'The white margin around the symbol is a quiet zone. Cropping it is the',
        'most common reason a printed code stops scanning — please leave it.',
        '',
        usedBrandColours
          ? 'Printed in the business\'s own brand colours, which passed the readability check.'
          : 'Printed in black on white: the brand colours did not have enough contrast to scan reliably. The QR screen in the admin shows which combination failed.',
        '',
        `Readability check: ${symbol.validation.ok ? 'passed' : 'FAILED — do not print; see the QR screen'}`,
        '',
      ].join('\n'),
    },
  ];

  await recordAudit({
    action: 'qr.generated',
    entity: 'business',
    entityId: tenant.businessId,
    businessId: tenant.businessId,
    userId: user.id,
    metadata: { kit: true, branchKey: branch?.key ?? null, pieces: pieces.length },
  });

  const zip = createZip(files);

  return new NextResponse(new Uint8Array(zip), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="qr-kit-${business.publicId}${suffix}.zip"`,
      'cache-control': 'no-store',
    },
  });
}

/** Accepts a stored hex colour, falling back rather than emitting nonsense. */
function symbolColour(value: string | null | undefined, fallback = '#000000'): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}
