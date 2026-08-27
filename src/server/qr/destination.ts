import { getEnv } from '@/lib/env';
import { isValidPublicId } from '@/lib/public-id';

/**
 * QR destinations (master spec §10, §11, §48, §166; GOALS I1, I2).
 *
 * This module is the *only* place a QR payload is constructed, and it can
 * construct exactly two shapes:
 *
 *   {PUBLIC_URL}/m/{publicId}
 *   {PUBLIC_URL}/m/{publicId}/b/{branchKey}
 *
 * That narrowness is the point. A QR that encoded a PDF link, a storage URL,
 * a template-specific path, a locale or a version would break the moment that
 * thing changed — which is precisely the failure mode the product exists to
 * avoid. Because the payload is derived from immutable identifiers only, a
 * regenerated QR is byte-identical to the printed one.
 */

export class QrDestinationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QrDestinationError';
  }
}

/** Branch keys are path segments; keep them to an unambiguous, stable shape. */
const BRANCH_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function isValidBranchKey(key: string): boolean {
  return BRANCH_KEY_PATTERN.test(key);
}

export interface QrDestinationInput {
  publicId: string;
  branchKey?: string | null;
}

export function buildQrDestination({ publicId, branchKey }: QrDestinationInput): string {
  if (!isValidPublicId(publicId)) {
    throw new QrDestinationError('Refusing to encode an invalid public identifier');
  }

  if (branchKey && !isValidBranchKey(branchKey)) {
    throw new QrDestinationError('Refusing to encode an invalid branch key');
  }

  const base = getEnv().PUBLIC_URL.replace(/\/$/, '');
  const path = branchKey ? `/m/${publicId}/b/${branchKey}` : `/m/${publicId}`;

  return `${base}${path}`;
}

/**
 * Guards against a destination that would violate the permanence invariant.
 * Used by the QR service before it will render anything, and by tests as the
 * executable statement of the rule.
 */
export function assertPermanentDestination(destination: string): void {
  let url: URL;

  try {
    url = new URL(destination);
  } catch {
    throw new QrDestinationError('QR destination must be an absolute URL');
  }

  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new QrDestinationError('QR destination must be served over HTTPS');
  }

  if (url.search || url.hash) {
    // A locale, a campaign tag or a version in the payload makes the code
    // mortal. Everything variable belongs behind the URL, not inside it.
    throw new QrDestinationError('QR destination must not carry query or fragment state');
  }

  const match = /^\/m\/([^/]+)(?:\/b\/([^/]+))?$/.exec(url.pathname);

  if (!match) {
    throw new QrDestinationError('QR destination must be a permanent profile path');
  }

  const [, publicId = '', branchKey] = match;

  if (!isValidPublicId(publicId)) {
    throw new QrDestinationError('QR destination must contain a valid public identifier');
  }

  if (branchKey !== undefined && !isValidBranchKey(branchKey)) {
    throw new QrDestinationError('QR destination must contain a valid branch key');
  }

  if (/\.(pdf|png|jpe?g|webp|svg)$/i.test(url.pathname)) {
    throw new QrDestinationError('QR destination must never point directly at a file');
  }
}
