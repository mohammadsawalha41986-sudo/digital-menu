import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/server/db/client';
import { parsePublicId } from '@/lib/public-id';
import { getStorage } from '@/server/storage';

/**
 * Where an install icon's artwork comes from. Only bytes this app already
 * holds are read: an uploaded logo from storage, or a file under public/.
 * A logo hosted elsewhere is never fetched from here, the same rule the
 * media module keeps for every other address (src/server/media/url.ts).
 */

const PUBLIC_DIR = path.join(process.cwd(), 'public');

/** The platform icon, used when a restaurant's logo cannot be read. */
export const PLATFORM_ICON = '/app-icon.svg';

/** Root-relative paths to an image under public/. Nothing else is read. */
const STATIC_IMAGE = /^\/[A-Za-z0-9/_.-]+\.(png|jpe?g|webp|svg)$/i;

/** Bytes of a file under public/, or null when the path names none there. */
export async function readPublicFile(urlPath: string): Promise<Uint8Array | null> {
  if (!STATIC_IMAGE.test(urlPath) || urlPath.includes('..')) return null;
  const full = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!full.startsWith(PUBLIC_DIR + path.sep)) return null;
  try {
    return new Uint8Array(await readFile(full));
  } catch {
    return null;
  }
}

/**
 * The logo bytes of a live menu, or null when there are none to read. A
 * restaurant with no logo, or with one hosted elsewhere, gets the platform icon.
 */
export async function readMenuLogo(publicId: string): Promise<Uint8Array | null> {
  const id = parsePublicId(publicId);
  if (!id) return null;

  const business = await prisma.business.findFirst({
    where: { publicId: id, status: 'ACTIVE' },
    select: { logo: { select: { storageKey: true, sourceUrl: true } } },
  });
  const logo = business?.logo;
  if (!logo) return null;

  if (!logo.storageKey.startsWith('external/')) {
    return (await getStorage().get(logo.storageKey)) ?? null;
  }
  return logo.sourceUrl ? readPublicFile(logo.sourceUrl) : null;
}
