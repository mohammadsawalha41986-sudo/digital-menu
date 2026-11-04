import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/server/auth/current-user';
import { TenantAccessError } from '@/server/tenancy/context';
import { exportCustomersCsv } from '@/server/customers/admin';

/**
 * The customer list as a CSV file. "subscribers" (the default) is the list
 * that may receive offers; "all" adds customers who ordered without asking
 * for offers. Manager or owner only; every export is audited.
 */
export async function GET(request: Request, context: { params: Promise<{ businessId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { businessId } = await context.params;
  const scope = new URL(request.url).searchParams.get('scope') === 'all' ? 'all' : 'subscribers';

  try {
    const file = await exportCustomersCsv(user, businessId, scope);
    return new NextResponse(file.body, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${file.fileName}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof TenantAccessError) return new NextResponse(null, { status: 404 });
    throw error;
  }
}
