/**
 * GET /api/v1/health — the versioned alias of /api/health (master spec §135).
 *
 * A re-export rather than a second implementation, so the two paths can never
 * disagree about what "healthy" means.
 */
export { GET } from '../../health/route';

export const dynamic = 'force-dynamic';
