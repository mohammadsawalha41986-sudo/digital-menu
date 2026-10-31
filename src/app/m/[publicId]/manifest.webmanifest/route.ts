import { getPublicProfile } from '@/server/profile/repository';
import { menuManifest } from '@/server/profile/install';

/**
 * The install manifest of one menu. A menu that is not live has none, so an
 * unpublished or hidden restaurant cannot be installed.
 */
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const profile = await getPublicProfile(publicId);
  if (!profile) return new Response('Not found', { status: 404 });

  return Response.json(menuManifest(profile), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      // Changes to the name or the logo show up soon, without a rebuild.
      'Cache-Control': 'public, max-age=300',
    },
  });
}
