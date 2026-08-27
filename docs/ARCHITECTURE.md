# Architecture

Decisions of record for Digital Profile OS. `docs/GOALS.md` states *what* the product must
be and which invariants are non-negotiable; this document states *how* the code is arranged
to keep them true, and why each choice was made over the alternatives.

Bracketed references — `[§10]`, `[I2]` — point to the master specification and to the
invariant table in `docs/GOALS.md`.

---

## 1. Application

**Next.js App Router, TypeScript, one deployable.** Public profiles, the admin surface and
`/api/v1` share a process. The spec calls for a standalone application on a single
subdomain `[§05, §132]`; splitting into services now would buy nothing and cost a
deployment story.

### Route organization

| Route | Purpose |
|---|---|
| `/` | Operational placeholder. The marketing site is a separate property `[§05]`. |
| `/m/[publicId]` | The permanent public profile. The most load-bearing URL in the product. |
| `/api/health` | Liveness/readiness for Docker, Coolify and load balancers `[§135]`. |
| `/admin/*` | Staff tooling — Phase 3. |
| `/api/v1/*` | Versioned REST API — Phase 9. |

### Server / client boundary

Everything is a server component unless it demonstrably needs the browser. Phase 0 ships
**zero client components**: a visitor who scans a QR gets HTML and CSS, no hydration cost.
The language switcher is a plain `<a>` that changes one search parameter, not a
JavaScript control.

The rule going forward: interactivity is introduced as a leaf (`'use client'` on the
smallest component that needs it), never by promoting a page or layout. Data access is a
server concern — `src/server/**` must never be imported from a client component, and
`src/server/db/client.ts` in a client bundle is a build error by construction.

### Data access strategy

- **Reads**: server components call repository functions in `src/server/**`.
- **Writes**: server actions for admin forms; `/api/v1` route handlers for programmatic
  and future AI Marketing OS access `[§129, §130]`.
- Repositories return **view models, not database rows** — see §4 below.

### Error handling

Three distinct audiences, three behaviours:

1. **Visitors** get a branded, neutral state. `notFound()` renders `not-found.tsx`, which
   says only that the profile is unavailable — never why. A malformed id, a nonexistent
   business, a draft business and a deactivated business are deliberately
   indistinguishable from outside, so the route cannot be used to enumerate businesses
   `[§119]`.
2. **Staff** will get actionable admin errors (Phase 3).
3. **Operators** get server logs. Technical detail never reaches a visitor `[§119]`.

---

## 2. Database

**PostgreSQL 16 via Prisma 7.** Relational, with real foreign keys and constraints — the
domain is relational, and the spec forbids papering over that with JSON blobs `[§121]`.

### Connection

Prisma 7 requires a driver adapter, so the connection string lives in the validated
environment (`src/lib/env.ts`) and reaches Prisma through `PrismaPg`, not through
`schema.prisma`. The CLI reads it from `prisma.config.ts`.

The client is **lazy behind a proxy** (`src/server/db/client.ts`). This is a deliberate
decision, not an optimisation: Next collects page data during `next build`, so an eagerly
constructed client would pull production secret validation into `docker build`, where
those secrets legitimately do not exist. Validation happens on first request instead.

### Migration strategy

`prisma migrate dev` in development, `prisma migrate deploy` on release. Migrations are
committed SQL and are the only sanctioned way the schema changes — no undocumented manual
edits `[§133]`. The migration files ship in the runtime image so a release can run
`migrate deploy` before serving.

### Transactions

Multi-row invariants use `prisma.$transaction`. Two cases are already known to need it and
are noted here so they are not discovered late:

- **Menu publication** — creating a `MenuVersion` and repointing `Menu.currentVersionId`
  must be atomic, or a visitor can observe a menu with no current version.
- **Excel import** (Phase 6) — a batch and its rows commit together so a rollback has a
  coherent point to restore to `[§76, §126]`.

### Seeding

`prisma/seed.ts` is deterministic: fixed public ids (`DEM001`, `DEM002`, `DRAFT1`), fixed
slugs, fixed menu keys. E2E tests navigate to literal URLs, and a developer's database
matches CI's. Every write is an upsert on a natural unique column, so re-running is safe.

The seed deliberately contains **no invented prices, calories or imagery** `[§37, I9]`,
and no seeded password — authentication arrives in Phase 3, and a known credential in
every environment is a liability.

---

## 3. Tenancy

The system is multi-tenant and isolation is **server-side only**. The frontend is never
part of the boundary `[§15, §128; I8]`.

### The access pattern

```
authenticated user → resolveTenantContext(user, requestedBusinessId) → TenantContext
                   → every query scoped by context.businessId
```

A business id arriving from a URL, a form field or a JSON body is a **request**, not a
grant. `src/server/tenancy/context.ts` converts it into a grant only after confirming a
`BusinessMembership` row for the authenticated user (or platform super-admin status).
`tenantScope(context)` is the only sanctioned way to build the `where` clause; it takes a
verified context rather than a raw id, so an unscoped query is visible in review.

Denial returns `null` rather than distinguishing "forbidden" from "not found" — confirming
that a business id exists is itself a leak. Roles are ranked (`VIEWER < EDITOR < MANAGER <
OWNER`) and checked with `roleAtLeast`.

This is the property most likely to be broken quietly by a future change, so
`tests/unit/tenancy.test.ts` asserts on *which query is issued*, not only on the result.

---

## 4. Public identifiers

Internal ids are cuids and never leave the server. Public URLs carry a **public id**:
`/m/7XK92A`, never `/m/18473` `[§122]`.

`src/lib/public-id.ts` generates 6-character codes from Crockford base32 **minus I, L, O
and U**, so a code read off a printed card cannot be misread as another valid code. Input
is normalized (uppercased, confusables repaired) and validated against that alphabet
*before* any database call — a malformed id is rejected in the application layer rather
than handed to the data layer `[§127]`.

The read model (`src/server/profile/types.ts`) carries no `id` field at all. A template
cannot leak an internal id into markup because it never receives one. An integration test
asserts that no cuid-shaped string appears anywhere in a serialized profile.

---

## 5. QR permanence

The single most load-bearing invariant `[§10, §11, §166; I1, I2]`.

```
QR  →  /m/{publicId}  →  Business  →  currently published menu version
                                   →  template + brand  →  rendered experience
```

The QR encodes exactly one variable: `publicId`. Everything downstream is resolved at
request time. That is why changing a price, an image, a template, a brand colour or a PDF
changes what a visitor sees while the printed code keeps working.

Structural consequences, each enforced by code rather than by convention:

- `Business.publicId` is unique and treated as immutable; no code path updates it.
- The route has no locale segment. Locale is a search parameter plus a cookie
  (see §7), so the path a QR encodes is byte-identical in every language.
- The template is a stored *key*, not a URL. Switching template rewrites one column.
- `MenuVersion` + `Menu.currentVersionId` mean publishing content creates a new row and
  repoints a pointer — it never changes an address.
- QR generation (Phase 2) will render `${PUBLIC_URL}/m/${publicId}` and nothing else. A
  QR that encodes a PDF link, a storage URL or a template-specific path is a defect.

---

## 6. Storage

`StorageProvider` (`src/server/storage/provider.ts`) is the only storage type domain code
sees: `put`, `get`, `head`, `exists`, `delete`, `publicUrl`, `signedUrl`. `getStorage()` in
`src/server/storage/index.ts` is the single composition point; adding Cloudflare R2 is one
branch there plus a class `[§56, §131]`.

`LocalStorageProvider` is the Phase 0 implementation. Keys are a security boundary — they
are interpolated into filesystem paths — so `assertSafeKey` rejects absolute paths,
traversal segments, backslashes, control characters and over-long keys, and the provider
re-checks that the resolved absolute path is inside its root `[§55]`.

---

## 7. Internationalisation

Arabic is the primary authored language; English is a first-class peer `[§07; I3]`.

### Locale is not in the URL

The permanent URL must not change per language `[I1/I2]`, so locale resolves from, in
order: `?lang=` → cookie → `Accept-Language` → the business's own default → Arabic.

`src/proxy.ts` (Next 16's renamed middleware convention) negotiates it and writes the
result onto **both** the request and the response, so the root layout can set `lang`/`dir`
on the very first response — Arabic renders RTL without a post-hydration flip.

This also satisfies "switching language preserves the current page" `[§08]` for free: the
switcher rewrites one search parameter and nothing else, so business, branch, menu and
category context all survive.

The document-level locale is negotiated without a database read; the profile root element
carries the fully-resolved locale, including the business's own default. Where they
differ, the inner element wins, which is valid HTML and correctly scoped.

### Two kinds of text, handled differently

- **Interface strings** (`src/i18n/dictionaries/*.json`) are authored by the team. English
  is typed against the Arabic shape, so a missing key is a build error rather than a raw
  key shown to a visitor `[§08]`.
- **Business content** (item names, descriptions) lives in the database in explicit
  `*_ar` / `*_en` columns. `resolveContent` returns the value **plus the locale it was
  actually authored in** and whether a fallback occurred. Templates use that to stamp
  `lang` and `dir` on the element, so Arabic-only copy displayed to an English visitor is
  marked as Arabic for the browser and assistive technology. The platform never
  machine-translates and never presents a generated string as authored `[§72; I9]`.

Nothing is authored English-first and translated afterwards.

### Formatting

`Intl` with an explicit `-u-nu-latn` numbering system. Arabic uses Western Arabic numerals
by choice: Gulf menus print `42 ر.س`, and price is the one value that must never cost a
second look `[§32]`.

---

## 8. RTL / LTR

RTL is a **native layout direction**, not `direction: rtl` bolted onto an LTR design
`[§98; I4]`.

- Stylesheets use logical properties exclusively: `margin-inline`, `padding-inline`,
  `inset-inline`, `border-block-end`, `text-align: start/end`.
- Physical directional properties (`margin-left`, `left:`, `text-align: right`) are
  **linted by test**: `tests/unit/design.test.ts` fails the build if one appears in a
  template stylesheet.
- `dir` is set from resolved locale on `<html>` and again on the profile root.
- The E2E suite asserts the *computed* `direction`, not just the attribute, in both
  languages.

---

## 9. Design tokens: template ≠ theme

Two token layers, deliberately not merged `[§26, §27; I6]`:

| Layer | Prefix | Owns | Lives in |
|---|---|---|---|
| System | `--sys-*` | Type scale, spacing rhythm, radius ramps, elevation, motion timings, tap targets | `src/design/tokens.css` |
| Brand | `--brand-*` | One business's colours, font choice, radius scale | emitted per profile by `src/design/brand.ts` |

**Template** = structure: composition, hierarchy, how an item detail opens, motion
personality. A React component plus a stylesheet, registered in
`src/templates/registry.ts`.

**Theme** = identity: the `BrandTheme` row, emitted as inline custom properties on the
profile root and consumed as `var(--brand-*)`.

Consequences:

- A template receives content and locale — never a colour. If a template ever needs a
  business colour as a *value*, the separation is being violated.
- Template stylesheets contain no literal colour. A unit test enforces this by scanning
  for hex and `rgb()`/`hsl()` literals.
- Swapping template and swapping brand are independent operations, and neither touches the
  public URL, the QR, menu data or analytics `[§149, §150]`.

Templates are **code, not database rows** — a row cannot faithfully describe a component
and a stylesheet. A business stores `templateKey` + `variantKey`, validated against the
registry on write and resolved leniently on read: an unknown key falls back to the default
family rather than 500-ing on a visitor who just scanned a QR code.

Brand colours are used to derive a readable foreground via WCAG relative luminance. The
same computation will back the QR contrast validator in Phase 2 `[§13]`.

---

## 10. Configuration

`src/lib/env.ts` is the only module that reads `process.env` for application config. It
validates with Zod and fails loudly, naming offending keys **without echoing their
values** — a config error must not print a database URL into a log `[§136]`.

Development gets safe localhost defaults so a clean checkout boots. Production is strict:
`AUTH_SECRET` is required and the development placeholder is rejected by name; selecting
`STORAGE_PROVIDER=r2` requires its credentials. Validation is lazy so importing a module
in a unit test does not require a full production configuration.

---

## 11. Security baseline

Phase 0 establishes, and later phases extend:

- Environment validated at startup; production placeholders rejected `[§136]`.
- Public identifiers validated before any query reaches the database `[§127]`.
- Tenant grants derived server-side from membership rows; client-supplied ids never
  trusted `[§128]`.
- No internal database ids in URLs, markup or read models `[§122]`.
- Storage keys validated; path traversal impossible by construction `[§55]`.
- Health endpoint reports dependency status only — no connection strings, no driver
  errors `[§135]`.
- Draft and inactive businesses are not publicly readable; unavailable states reveal
  nothing about why.
- All database access goes through Prisma's parameterised queries — no string-built SQL.
- Locale cookie is `sameSite=lax` and `secure` in production.

Deferred with intent: authentication and RBAC enforcement (Phase 3), file upload MIME and
content validation (Phase 4), rate limiting (Phase 9).

---

## 12. Testing

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | Public-id rules, env validation, locale resolution and content fallback, storage key safety, brand token emission, template resolution, stylesheet discipline, tenant isolation (mocked data layer) |
| Integration | Vitest + Postgres | Public profile resolution: id normalisation, draft invisibility, published-menu filtering, no-internal-id guarantee. Skips cleanly when no database is reachable. |
| E2E | Playwright | Smoke journey on a mobile viewport against a production build |

The E2E suite runs against `next start` on a Pixel-7 viewport because mobile is the
primary design target `[§29, §139]`, and includes an explicit no-horizontal-overflow check
at 360/375/390/414/430px.

`next start` runs as `NODE_ENV=production`, where the environment layer correctly refuses
the development placeholder secret. The Playwright config supplies a real ephemeral
`AUTH_SECRET` rather than weakening that check.

---

## 13. Deployment

Multi-stage `Dockerfile` producing a `next build --output standalone` runtime image with no
toolchain, no source and no dev dependencies, running as a non-root user, with a
`HEALTHCHECK` hitting `/api/health` `[§132, §135]`.

**No secret is required at image build time.** That is what the lazy database client buys:
the same image can be built in CI and configured at deploy time.

`docker-compose.yml` runs Postgres for development and keeps the dev server on the host —
containerising it would cost fast refresh for no benefit. The production image is
available behind the `app` profile for verifying a release build locally.

Redis is not used yet. When caching, rate limiting or background jobs need it, it goes
behind an interface in `src/server/**` the way storage did, and stays optional for local
development `[§134]`.

---

## 14. Decisions taken where the specification was silent

1. **Locale as a search parameter, not a path segment.** The spec fixes the public URL
   shape and demands language switching preserve context; a `/[locale]/m/...` scheme would
   have made the QR-encoded path locale-specific.
2. **Templates in code, not in a database table.** The spec lists a `templates` entity;
   a row cannot describe a component and a stylesheet, so the registry is code and the
   business stores a validated key. The catalogue is still enumerable for admin UI.
3. **Money as integer minor units.** Not stated in the spec; floats are wrong for money.
4. **Western Arabic numerals in Arabic.** Regional convention for menu pricing, and price
   legibility is explicitly mandated `[§32]`.
5. **Public ids exclude I, L, O and U.** Not stated; printed codes get read aloud and
   retyped, and an ambiguous alphabet would produce collisions between distinct codes.
6. **`?lang=` beats the business default.** An explicit visitor choice outranks a
   configured default.

---

## 15. Content domain (Phase 1)

```
Business ─┬─ Branch ── BranchItemOverride ──┐
          ├─ Media                          │
          └─ Menu ── MenuCategory ── MenuItem ── MenuItemImage
                  └─ MenuVersion (publication pointer)
```

Decisions worth recording:

- **`MenuItem.businessId` is denormalised.** Items reach their tenant through
  `category → menu → business`, but every tenant-scoped query would then need a three-hop
  join, and one missed hop is a cross-tenant leak. A direct `businessId` column makes the
  scope a single predicate and gives the Excel importer (`@@unique([businessId, itemCode])`)
  the key it matches on.
- **`itemCode` is the stable public item identity**, business-scoped and human-writable. It
  is what Excel exports carry and imports match, which is how a bulk price edit updates
  rather than duplicates (§66).
- **Branch overrides are rows, not menu copies.** A branch that changes one price gets one
  `BranchItemOverride`; the shared menu is untouched (§86). The repository loads overrides
  only when a branch is in scope, so the common case costs nothing.
- **An unknown branch key degrades to the business view**, deliberately: a printed branch
  QR must keep working after a branch is renamed or retired.
- **Media rows own the storage key**, never a vendor URL. `/uploads/[...key]` serves local
  objects and refuses any key with no `Media` row, so an object on disk cannot be fetched
  by guessing a path (§108).
- **Item detail is a native `<details>` disclosure.** No JavaScript, keyboard accessible,
  works before hydration; each template styles it into a card, drawer or row (§39, §103).

---

## 16. The template system at full strength (Phase 8)

Ten families ship, and the thing that makes them ten templates rather than one
template with ten palettes is **composition**:

| Family | What is structurally different |
|---|---|
| Editorial | Sticky category index, rule-separated rows, price as a tabular figure. No cards. |
| Luxury | Centred ceremonial masthead, *no* category navigation, items as centred stanzas, at most one photograph per category. |
| Minimal | Renders no photography at all. One line per item. No navigation, no disclosure, no motion. |
| Modern | Sticky identity bar, pill chips, horizontal rows with a square thumbnail, fixed contact dock on phones. |
| Bold | Full-bleed bands rather than a content column; slab category titles; price set as large as the item name. |
| Dark | Image mosaic on a ground *derived* from the brand's text colour; captions over a scrim; featured items span two columns. |
| Hospitality | Address and hours above the catalogue; collapsible service groups; duration beside price; a booking action after every group. |
| Café | Compact square tiles two-up; underlined tabs; size and price stacked. |
| Casual | Opens with large category picture tiles, then generous photo-left rows. |
| Premium | One item per category at feature size with a standfirst, the rest as a quiet two-column index. |

### How the separation is enforced rather than promised

Four unit tests and one E2E suite make "template ≠ theme" checkable:

- **No colour literals.** Every family's stylesheet is scanned for hex and
  `rgb()`/`hsl()` values. Brand identity may only enter as `--brand-*`.
- **Logical properties only.** Physical directional properties fail the build,
  so RTL cannot regress in any family.
- **Distinct motion.** No two families may share a keyframe name; Minimal must
  declare no motion at all. Families that all animate alike are one family.
- **Distinct vocabulary.** Each family's markup must use its own class prefix,
  and an E2E test asserts the six demos share *zero* class names.
- **Variants must do something.** Every variant declared in the registry must
  have a matching `[data-variant]` rule in its stylesheet — a variant offered
  in admin that changes nothing would be a lie.

### The §140 design QA, automated

A machine cannot judge taste, but it can prove the properties that make two
pages the same website. `e2e/design-qa.spec.ts` loads the six demo businesses
and asserts they differ in class vocabulary, palette and structural
fingerprint (item element, list display mode, column count, measure, text
alignment, presence of navigation), that every one renders natively in both
directions with no horizontal overflow at 360/390/430/768/1200px, and that
none renders an empty container.

That last check earned its place immediately: it caught the salon demo
rendering an empty details card, because that business has no address and no
contact channels. Fixed in the same phase.

### Dark, and deriving rather than declaring

Dark is the one family whose surface is not taken directly from the brand. It
uses `color-mix` to darken the brand's own text colour, so a business with a
deep green brand gets a green-black page and one with warm brown gets a
brown-black one — rather than every "dark" business landing on the same
near-black. It still declares no colour of its own.
