import { getPublicProfile } from '@/server/profile/repository';
import { PLATFORM_ICON, readMenuLogo, readPublicFile } from '@/server/profile/app-icon';
import { renderAppIcon, iconBackground } from '@/server/profile/app-icon-render';
import { parseAppIconFile } from '@/server/profile/install';

/**
 * One install icon of a menu: the restaurant's logo, drawn to the size asked
 * for, on the brand colour. A menu that is not live has no icon, so nothing
 * about an unpublished restaurant is served here.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = () => new Response('Not found', { status: 404 });

export async function GET(_request: Request, { params }: { params: Promise<{ publicId: string; file: string }> }) {
  const { publicId, file } = await params;

  const size = parseAppIconFile(file);
  if (!size) return NOT_FOUND();

  const profile = await getPublicProfile(publicId);
  if (!profile) return NOT_FOUND();

  const background = iconBackground(profile.brand.colorBackground);
  const platform = await readPublicFile(PLATFORM_ICON);
  const artwork = (await readMenuLogo(publicId)) ?? platform;

  let png: Uint8Array;
  try {
    if (!artwork) throw new Error('no artwork to draw');
    png = await renderAppIcon({ size, background, artwork });
  } catch (error) {
    // A logo that will not decode must not stop the menu being installed.
    console.error('[app-icon] falling back to the platform icon', {
      publicId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    if (!platform) return new Response('Icon unavailable', { status: 503 });
    png = await renderAppIcon({ size, background, artwork: platform });
  }

  return new Response(png as BodyInit, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
