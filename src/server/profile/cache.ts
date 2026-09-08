import { revalidateTag, unstable_cache } from 'next/cache';
import { getPublicProfile, type GetPublicProfileOptions } from './repository';
import type { PublicProfile } from './types';

/**
 * Public profile caching (master spec §114, §115) — DESIGNED, NOT WIRED IN.
 *
 * Read this before trusting it. `getCachedPublicProfile` has no callers: every
 * public route calls `getPublicProfile` directly, so nothing on the public
 * side is cached across requests today, and `invalidateProfile` evicts a tag
 * that nothing carries. The `revalidatePath` calls that sit beside it at every
 * call site are real and still do their job; the tag eviction is currently a
 * no-op kept in place so wiring this up later does not mean revisiting ten
 * files.
 *
 * The intended strategy stands and is implemented below: cache indefinitely,
 * invalidate explicitly, tagged per business so publishing one menu does not
 * evict every profile on the platform. Never a timer, because a timer means a
 * window during which a corrected price is still wrong and that window has no
 * good length.
 *
 * What is missing is the reason it should stay unwired until someone finishes
 * it: a profile carries offers, and an offer's visibility depends on the
 * current time. A cached page cannot express "expires at 22:00" (§42), so
 * enabling this as written would serve expired offers to visitors. The gate
 * that would exclude time-dependent profiles was never written. Wire this in
 * only together with that gate.
 *
 * Within a single request the duplicate loads are already gone —
 * `getPublicProfile` is deduplicated with React's request-scoped `cache`, which
 * has none of the staleness questions above.
 */

export function profileTag(publicId: string): string {
  return `profile:${publicId.toUpperCase()}`;
}

/**
 * Cached profile read. Currently unused — see the note at the top of this file.
 *
 * A caller must first decide whether this profile is safe to cache at all:
 * one carrying a live or scheduled offer is not, because the cached copy
 * cannot express when the offer stops being true.
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
 * Missing a call here would be a stale menu once the cache above is wired in,
 * so the safe default is to over-call — invalidation is cheap, a wrong price
 * is not. Until then this evicts a tag nothing carries and costs nothing.
 */
export function invalidateProfile(publicId: string): void {
  // Next 16 takes an explicit cache-profile argument; `max` evicts every
  // cached entry carrying the tag rather than only the freshest.
  revalidateTag(profileTag(publicId), 'max');
}
