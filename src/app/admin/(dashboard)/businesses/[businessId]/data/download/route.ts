import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/server/auth/current-user';
import { resolveTenantContext } from '@/server/tenancy/context';
import { buildErrorReport, buildImportTemplate, exportMenu } from '@/server/import/export';

/**
 * Export downloads: the blank template, a menu export, or a batch error report.
 *
 * A route handler because each response is a file. Authorization follows the
 * same path as every other admin request — the business id in the URL is a
 * request, not a grant.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { businessId } = await context.params;
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind') ?? 'export';

  // The blank template contains no tenant data, so it needs only a signed-in
  // user — but everything else needs a grant.
  if (kind === 'template') {
    const template = await buildImportTemplate();
    return fileResponse(template);
  }

  const tenant = await resolveTenantContext(user, businessId);
  if (!tenant) return new NextResponse(null, { status: 404 });

  if (kind === 'errors') {
    const batchId = url.searchParams.get('batch');
    if (!batchId) return new NextResponse(null, { status: 400 });

    const report = await buildErrorReport(user, businessId, batchId);
    return fileResponse(report);
  }

  const result = await exportMenu(user, businessId, {
    audience: url.searchParams.get('audience') === 'client' ? 'client' : 'admin',
    format: url.searchParams.get('format') === 'csv' ? 'csv' : 'xlsx',
    menuKey: url.searchParams.get('menu'),
  });

  return fileResponse(result);
}

function fileResponse(result: { bytes: Uint8Array; fileName: string; contentType: string }) {
  return new NextResponse(result.bytes as unknown as BodyInit, {
    headers: {
      'content-type': result.contentType,
      'content-disposition': `attachment; filename="${result.fileName}"`,
      'cache-control': 'no-store',
    },
  });
}
