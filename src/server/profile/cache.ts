import { revalidateTag, unstable_cache } from 'next/cache';
import { getPublicProfile, type GetPublicProfileOptions } from './repository';
import type { PublicProfile } from './types';

/**
 * Public profile caching (master spec §114, §115).
 *
 * Public profiles are read-heavy and change rarely, so they cache well — but
 * a stale price is a real-world problem, not an inconvenience. So the strategy
 * is **cache indefinitely, invalidate explicitly**: never a timer, because a
 * timer means a window during which a corrected price is still wrong, and that
 * window has no good length.
 *
 * Tags are per business, so publishing one menu does not evict every profile
 * on the platform.
 */

export function profileTag(publicId: string): string {
  return `profile:${publicId.toUpperCase()}`;
}

/**
 * Cached profile read.
 *
 * Offers are deliberately *excluded* from caching by the caller (see
 * `shouldCache` below): their visibility depends on the current time, and a
 * cached page cannot express "expires at 22:00" (§42).
 */
export function getCachedPublicProfile(
  publicId: string,
  options: GetPublicProfileOptions = {},
): Promise<PublicProfile | null> {
  const key = `${publicId.toUpperCase()}:${options.branchKey ?? ''}`;

  return unstable_cache(
    () => getPublicProfile(publicId, options),
    ['public-profile', key],
    { tags: [profileTag(publicId)] },
  )();
}

/**
 * Invalidates one business's public profile.
 *
 * Called after every write that changes what a visitor sees: menu publication,
 * price edits, brand and template changes, file replacement, offer changes.
 * Missing a call here is a stale menu, so the safe default is to over-call —
 * invalidation is cheap, a wrong price is not.
 */
export function invalidateProfile(publicId: string): void {
  // Next 16 takes an explicit cache-profile argument; `max` evicts every
  // cached entry carrying the tag rather than only the freshest.
  revalidateTag(profileTag(publicId), 'max');
}
