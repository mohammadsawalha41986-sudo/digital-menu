import { NextResponse } from 'next/server';
import { ApiAuthError, ApiRateLimitError } from './auth';

/**
 * Consistent API envelopes (master spec §129).
 *
 * One shape for success, one for failure, everywhere. A consumer writes the
 * unwrapping once — which is the entire point of "consistent JSON responses"
 * and the difference between an API that is pleasant to integrate and one
 * that needs a special case per endpoint.
 */

export interface ApiMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export function ok<T>(data: T, meta?: ApiMeta) {
  return NextResponse.json(
    { data, ...(meta ? { meta } : {}) },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export function failure(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}

/**
 * Turns a thrown error into a response.
 *
 * Unexpected errors are logged in full and reported as a bare 500: a stack
 * trace in an API response is an information leak (master spec §119).
 */
export function handleApiError(error: unknown) {
  if (error instanceof ApiRateLimitError) {
    return NextResponse.json(
      { error: { code: 'rate_limited', message: error.message } },
      {
        status: 429,
        headers: {
          'cache-control': 'no-store',
          'retry-after': String(error.retryAfterSeconds),
        },
      },
    );
  }

  if (error instanceof ApiAuthError) {
    return failure(error.status, error.status === 404 ? 'not_found' : 'unauthorized', error.message);
  }

  console.error('[api] unhandled error', error);
  return failure(500, 'internal_error', 'Something went wrong');
}

export interface ListQuery {
  page: number;
  perPage: number;
  sort: string;
  order: 'asc' | 'desc';
  search: string | null;
}

const MAX_PER_PAGE = 100;

/**
 * Parses pagination, sorting and filtering (§129).
 *
 * The sort field is checked against an allowlist supplied by the caller rather
 * than passed through: an unchecked field name reaches the query builder, and
 * that is how an ordering parameter becomes an injection vector.
 */
export function parseListQuery(request: Request, allowedSorts: readonly string[]): ListQuery {
  const url = new URL(request.url);

  // `|| fallback` would treat an explicit 0 as missing and silently return the
  // default page size; check for a real number instead.
  const page = Math.max(1, integerParam(url, 'page', 1));
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, integerParam(url, 'per_page', 25)));

  const requestedSort = url.searchParams.get('sort') ?? '';
  const sort = allowedSorts.includes(requestedSort)
    ? requestedSort
    : (allowedSorts[0] ?? 'createdAt');

  const order = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc';
  const search = (url.searchParams.get('search') ?? '').trim().slice(0, 100) || null;

  return { page, perPage, sort, order, search };
}

function integerParam(url: URL, name: string, fallback: number): number {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildMeta(query: ListQuery, total: number): ApiMeta {
  return {
    page: query.page,
    perPage: query.perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.perPage)),
  };
}
