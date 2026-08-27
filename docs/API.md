# API

Versioned REST API at `/api/v1`, for programmatic access and for the AI Marketing OS
integration (master spec §129, §130).

## Authentication

Bearer tokens. The consumer is a service, not a browser, so there is no session and no
CSRF surface.

```http
GET /api/v1/businesses HTTP/1.1
Authorization: Bearer dpo_a1b2c3d4_<64 hex characters>
```

Keys are issued in admin at `/admin/api-keys` by a platform super admin.

**A key is shown once.** The database stores a SHA-256 hash plus a public 8-character
prefix; the prefix identifies a key in admin and makes lookup a single indexed read, and
the hash means a leaked database backup yields no working credential. Comparison is
constant-time.

Both halves of the token are hex, deliberately: base64url contains `_`, which is also the
field delimiter, and a secret containing one would make the token ambiguous to parse. The
alphabet is disjoint from the delimiter so that failure mode cannot occur.

### Every authentication failure looks the same

Missing header, malformed token, unknown key, revoked key, expired key — all return:

```json
{ "error": { "code": "unauthorized", "message": "Authentication required" } }
```

with `401`. The endpoint is not an oracle for which keys exist.

### Scope

A key carries either an explicit business allowlist or none, meaning platform-wide.
Requesting a business outside the allowlist returns **`404`, not `403`** — the API must not
confirm that a business exists to a key that cannot read it.

## Response envelopes

One shape for success, one for failure, everywhere. A consumer writes the unwrapping once.

```json
{ "data": { … } }
{ "data": [ … ], "meta": { "page": 1, "perPage": 25, "total": 42, "totalPages": 2 } }
{ "error": { "code": "not_found", "message": "Not found" } }
```

An unexpected server error is logged in full and returned as a bare `500` with
`code: "internal_error"`. A stack trace in an API response is an information leak.

## Listing parameters

| Parameter | Default | Notes |
|---|---|---|
| `page` | `1` | 1-indexed |
| `per_page` | `25` | Capped at 100 |
| `sort` | first allowlisted field | **Checked against a per-endpoint allowlist.** An unrecognised field falls back rather than reaching the query builder |
| `order` | `desc` | `asc` \| `desc` |
| `search` | — | Truncated to 100 characters |

## Identity

Businesses are addressed by **public id** — the same opaque identifier the QR encodes
(`/m/7XK92A`). Internal database ids never appear in a request or a response, so an
integrating system learns exactly one identifier and it is the one already printed on the
customer's table.

## Endpoints

### `GET /api/v1/businesses`

Lists businesses the key may read. Searchable on Arabic name, English name and slug.

```json
{
  "data": [
    {
      "public_id": "7XK92A",
      "slug": "demo-restaurant",
      "type": "RESTAURANT",
      "status": "ACTIVE",
      "name": { "ar": "مطعم النموذج", "en": "Demo Restaurant" },
      "default_locale": "ar",
      "currency": "SAR",
      "template": { "family": "editorial", "variant": "a" },
      "counts": { "menus": 2, "branches": 2, "items": 8 },
      "updated_at": "2026-08-27T10:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "perPage": 25, "total": 1, "totalPages": 1 }
}
```

### `GET /api/v1/businesses/{publicId}`

One business with full contact detail, service package and branch list.

### `GET /api/v1/businesses/{publicId}/menus`

The full menu tree. `?published=true` returns only what a visitor would see right now.

Prices carry **both** representations:

```json
"price": { "minor_units": 4200, "decimal": "42", "currency": "SAR" }
```

A consumer that computes never parses; one that displays never needs to know a currency's
minor-unit count. `null` means the business has not set a price — never `0`.

`calories: null` likewise means the business never measured it. The platform does not
infer nutrition data (§37).

### `GET /api/v1/businesses/{publicId}/offers`

Every offer with its **computed state** — `live`, `scheduled`, `expired`, `disabled` — so a
marketing system does not re-implement the window arithmetic and reach a different answer
than the profile does.

### `GET /api/v1/businesses/{publicId}/analytics?range=30d`

Aggregate counts only: profile views, QR scans, unique visitors, per-event and per-device
breakdowns. Ranges: `today`, `7d`, `30d`, `90d`, `all`.

The event table holds no personal data to begin with (see `docs/ARCHITECTURE.md` §7), and
this endpoint returns counts rather than rows, so individual visits cannot be
reconstructed even in principle.

### `GET /api/v1/profiles/{publicId}` — unauthenticated

The public read model: exactly what the rendered profile already shows a visitor.
Deliberately open, because requiring a key would protect nothing while making the obvious
integration harder. Optional `?branch={key}`.

It uses the same repository as the page, so private data is excluded by one set of rules
rather than two.

### `GET /api/v1/health`

Alias of `/api/health`, re-exported rather than reimplemented so the two paths cannot
disagree about what "healthy" means.

## AI Marketing OS integration

The ecosystem boundary in master spec §06 is an API, never a shared database. This is that
API.

- A key may carry a `marketing_client_id` — how the consuming system identifies this
  client — so the two systems can correlate without either learning the other's internal
  ids.
- Businesses and branches are addressed by public id and branch key.
- Everything is read-only today. Write endpoints (§130's "Update Business", "Update Menu",
  "Update Offer") are **not implemented**: they need an authorisation model for machine
  writes that the spec does not yet specify, and a half-designed write API against
  customer menus is worse than none. The read surface, the key model and the scope
  boundary are all in place for them to build on.

## Rate limiting

The public event-ingest endpoint (`/api/events`) is rate-limited per client per business,
in-process. When the platform runs more than one instance this moves behind the Redis
abstraction; the shape of the check does not change.

`/api/v1` is not rate-limited yet — keys are issued individually to known consumers, so
the practical control today is revocation.
