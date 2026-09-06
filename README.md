# Digital Profile OS

Premium, dynamic digital business profiles behind a **permanent QR code** — Arabic-first,
English-supported, mobile-first, multi-tenant, multi-template, run as a managed service.

A visitor scans a QR (or opens a permanent URL) and gets a branded experience: menu or
service catalogue, offers, images, prices, calories where provided, downloadable menu
files, contact, social and location. No login, no app, no ordering.

The company operates the platform. The client receives a finished service.

## The one rule everything else serves

```
QR → /m/{publicId} → Business → current published content → Template → Brand Theme
```

The QR encodes exactly one variable: the public id. Changing prices, images, calories,
offers, the PDF menu, the brand or the template changes what a visitor sees — **it never
changes the QR or the URL.**

`tests/integration/qr-permanence.test.ts` proves it: it changes every one of those things
and asserts the QR payload and rendered SVG are byte-identical afterwards.

## What is built

| Area | State |
|---|---|
| Public profile | Ten template families, Arabic-first, native RTL/LTR, zero-JS render |
| Permanent QR | Generation, four artwork styles, readability validation, branch codes |
| Admin | Auth, RBAC, businesses, branches, menus, publishing, brand, template preview, media, files, offers, analytics, import/export, API keys |
| Content | Menus, categories, items, branch price overrides, offers with scheduling |
| Files | PDF upload with versioning, external menu links, public downloads |
| Media | Image library with three-way validation, assignment, dedup, safe deletion |
| Bulk | Excel/CSV import with preview, mapping, partial import, rollback; import-shaped export |
| Analytics | Privacy-conscious events, no PII, admin reporting |
| API | `/api/v1` read surface with scoped bearer keys |
| Menu Studio | Brand identity measured from the logo, ten data-driven themes, live preview, modifiers, bulk edit |
| Typography | Six self-hosted OFL families covering Arabic and Latin, subset per script, preloaded per business |
| Publishing | Content snapshots per version, draft-vs-live comparison, rollback, menu scheduling |
| Quality | Profile Health with severities and fix links; an agency dashboard answering what needs attention |
| Client review | Expiring, revocable preview links; approval and change requests without an account |
| Media | Focal points, WebP derivatives at four widths, quality assessment |
| Nutrition | Structured fields and a readiness layer that never claims compliance |
| Staff | Accounts, platform roles, per-business grants, password reset and change |
| Print | Printable menu with correct Arabic, and a QR print kit sized in millimetres |
| Deployment | Multi-stage Docker image needing no build-time secrets, compose, health checks, CI, Railway |

Known gaps are listed at the end of this file, honestly.
**[`docs/IMPLEMENTATION-STATUS.md`](docs/IMPLEMENTATION-STATUS.md) is the single
source of truth for what is built** — if another document disagrees with it,
that document is stale. `docs/PRODUCTION-READINESS-AUDIT.md` is the current
audit, and `docs/FINAL-PRODUCTION-READINESS-REPORT.md` carries the verdict and
the two things standing between this and a production-ready claim.

## Documentation

| Document | Covers |
|---|---|
| [`docs/GOALS.md`](docs/GOALS.md) | Product invariants and the phased plan |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Decisions of record and why |
| [`docs/MENU-STUDIO.md`](docs/MENU-STUDIO.md) | The studio: brand engine, theme layer, and what is not claimed |
| [`docs/DOMAIN.md`](docs/DOMAIN.md) | The vocabulary and what each term may mean |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Schema, indexes, transactions, migrations |
| [`docs/QR.md`](docs/QR.md) | Payload rules, artwork, readability validation |
| [`docs/TEMPLATES.md`](docs/TEMPLATES.md) | The ten families, variants, how to add one |
| [`docs/THEMES.md`](docs/THEMES.md) | Token layers, derived values |
| [`docs/EXCEL-IMPORT.md`](docs/EXCEL-IMPORT.md) | Columns, validation, rollback, export |
| [`docs/API.md`](docs/API.md) | Endpoints, auth, envelopes, AI Marketing OS integration |
| [`docs/MENU-STUDIO.md`](docs/MENU-STUDIO.md) | The studio: brand engine, theme layer, and what is not claimed |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Docker, Coolify, Railway, environment, backups |

**Status, operations and verification**

| Document | Covers |
|---|---|
| [`docs/IMPLEMENTATION-STATUS.md`](docs/IMPLEMENTATION-STATUS.md) | **The single source of truth for feature status** |
| [`docs/PRODUCTION-READINESS-AUDIT.md`](docs/PRODUCTION-READINESS-AUDIT.md) | What was found when the system was actually run |
| [`docs/FINAL-PRODUCTION-READINESS-REPORT.md`](docs/FINAL-PRODUCTION-READINESS-REPORT.md) | Verdict, scores, and what remains |
| [`docs/PRODUCTION-RUNBOOK.md`](docs/PRODUCTION-RUNBOOK.md) | Releasing, health, smoke tests, backups, common situations |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Threat model, defences, and accepted risks |
| [`docs/TESTING.md`](docs/TESTING.md) | The layers, how to run them, and what PASS means |
| [`docs/MEDIA.md`](docs/MEDIA.md) | The upload pipeline, alt text, and the demo artwork |

## Quick start

Requirements: **Node 20.11+** (22 recommended), **Docker** (for Postgres), npm.

```bash
git clone <repo> && cd digital-menu
cp .env.example .env          # safe local defaults; no real secrets needed

docker compose up -d postgres # Postgres 16 on :5432
npm install
npm run db:migrate            # apply migrations
npm run db:seed               # demo data — prints an admin password once
npm run dev                   # http://localhost:3000
```

The seed prints a generated admin password **once**. Set `SEED_ADMIN_PASSWORD` to choose
your own.

Then open:

| URL | What it is |
|---|---|
| `/admin` | Staff dashboard (sign in with the seeded account) |
| `/admin/businesses/{id}/studio` | Menu Studio — brand identity, themes, live preview |
| `/m/DEM001` | Demo restaurant — Editorial, two branches |
| `/m/DEM001/b/olaya` | The same business, branch-scoped, with its own price |
| `/m/DEM002?lang=en` | Arabic-only business seen by an English visitor |
| `/m/DEM003` … `/m/DEM007` | Luxury, Café, Bold, Casual, Hospitality showcase |
| `/m/DRAFT1` | A draft business — deliberately not public (404) |
| `/api/health` | Health and readiness |

The five showcase profiles exist to be compared side by side. If they look like the same
website, that is a bug — and `e2e/design-qa.spec.ts` fails when they do.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (needs no secrets) |
| `npm start` | Serve the production build |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `npm test` | Vitest — unit + integration |
| `npm run test:e2e` | Playwright (build first) |
| `npm run db:migrate` / `db:deploy` / `db:status` / `db:validate` | Migrations |
| `npm run db:seed` | Deterministic seed |

`npm run test:e2e` runs against `next start`. In sandboxes with a preinstalled Chromium,
point Playwright at it: `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium npm run test:e2e`.

## Environment

Every variable is validated at startup by `src/lib/env.ts`. Missing or malformed
configuration fails loudly and names the offending key — **without printing its value**.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | always | |
| `APP_URL` | defaulted | Origin serving admin and the API |
| `PUBLIC_URL` | defaulted | **Baked into every QR payload — immutable once codes are printed** |
| `AUTH_SECRET` | production | `openssl rand -base64 32`; the dev placeholder is rejected by name |
| `STORAGE_PROVIDER` | defaulted | `local` \| `r2` |
| `ANALYTICS_SALT` | recommended | Without it, visits count anonymously rather than with a predictable hash |
| `REDIS_URL` | optional | Not required today |

`.env` is gitignored; `.env.example` holds placeholders only.

## Arabic / English and RTL / LTR

Arabic is the primary authored language. English is a peer, not a translation pass.

**Locale never appears in the URL.** A printed QR must resolve to a byte-identical path
forever, so locale resolves from `?lang=` → cookie → `Accept-Language` → the business's
default → Arabic. `src/proxy.ts` negotiates it and writes it onto the request, so the
first response already carries the right `lang`/`dir` — no post-hydration flip.

**Interface strings** are typed against the Arabic shape, so a missing English key is a
build error, never a raw key shown to a visitor.

**Business content** lives in explicit `*_ar` / `*_en` columns. `resolveContent` returns
the text *plus the locale it was authored in*, so Arabic-only copy shown to an English
visitor renders as Arabic with correct `lang`/`dir` rather than machine-translated. The
platform never fabricates a translation.

**RTL is native**: logical properties only. A unit test fails the build if a physical
directional property appears in any template stylesheet, and the E2E suite asserts the
computed `direction` for every demo in both languages.

## Project structure

```
prisma/                    schema, migrations, deterministic seed
src/
  app/
    m/[publicId]/          THE permanent public profile (+ /b/[branchKey])
    f/[publicId]/[fileKey] public file downloads
    admin/                 staff dashboard
    api/v1/                versioned REST API
    api/events/            analytics ingest
  design/                  system tokens (--sys-*), brand tokens (--brand-*)
  i18n/                    locale resolution, bilingual content, formatting
  lib/                     env validation, public ids, money
  server/
    admin/                 write services + server actions
    analytics/             privacy, recording, reporting
    api/                   API auth and envelopes
    auth/                  password, session, current user
    files/ media/          uploads and the media library
    import/                spreadsheet parse, validate, execute, export
    offers/                scheduling
    profile/               public read model, render path, caching
    qr/                    destinations, validation, artwork
    tenancy/               server-side isolation
  templates/               ten families + shared primitives
tests/unit, tests/integration, e2e/
docs/
```

## Contributing notes

Four rules carry more weight than the rest, because breaking them contradicts the product
rather than the code:

1. **Never change what a QR resolves to.** `/m/{publicId}` is permanent. No locale
   segment, no template in the path, no id rotation.
2. **Never trust a client-supplied business id.** Go through `resolveTenantContext` /
   `tenantScope`.
3. **Never hard-code a business colour, font or copy string in a component.** Brand
   arrives as `--brand-*`; content arrives from the database in both languages.
4. **Never invent data.** No fabricated calories, translations, discounts or metrics. An
   absent value is absent — not zero, not a guess.

## Known gaps

Stated plainly rather than left to be discovered:

- **Cloudflare R2 provider is not implemented.** The `StorageProvider` abstraction and the
  R2 environment validation are in place; selecting `STORAGE_PROVIDER=r2` throws a clear
  error at first use. Adding it is one class and one branch, with no domain changes.
- **API write endpoints are not implemented.** The read surface, key model and scope
  boundary are complete. Writes need an authorisation model for machine actors that the
  spec does not specify.
- **Image ZIP import (§71) is not implemented.** `image_url` is validated but not fetched;
  fetching arbitrary URLs server-side is an SSRF surface needing an allowlist and a fetch
  budget.
- **AVIF derivatives are not generated.** WebP versions at 320/640/1024/1600 are,
  and are served through `srcset`. AVIF encodes smaller but costs an order of
  magnitude more CPU per image, which does not belong in an upload request; it
  becomes worth adding behind a queue.
- **Demo photography is absent.** The demo businesses carry no images, because the spec
  bars low-quality stock and infringing assets and no licensed set was available. Every
  template renders correctly with and without imagery.
- **Server-side PDF generation is not implemented, deliberately.** `/m/{id}/print`
  renders the live menu for paper and the browser turns it into a PDF — which is
  what gets Arabic shaping and bidirectional text right. `docs/PUBLISHING.md`
  records exactly what server-side generation would additionally require.
- **Drag-and-drop *ordering* is not implemented.** Ordering is by `sort_order`
  through forms and the spreadsheet, which works with a keyboard, on a phone and
  with no JavaScript. (Drag-and-drop *upload* does exist, in the importer.)
- **Rate limiting is in-process.** Fine for one instance; it moves behind Redis when a
  second is added.
- **Docker Compose is unverified by execution** in the environment this was built in (no
  Docker daemon). The Dockerfile and compose file are authored and reviewed; CI exercises
  the Postgres service path.
