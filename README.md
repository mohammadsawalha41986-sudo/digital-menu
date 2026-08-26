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

## Status

**Phase 0 (foundation) complete.** The application scaffold, database, tenancy boundary,
public profile route, i18n/RTL architecture, design-token layer, storage abstraction and
test infrastructure are in place. Menus, categories, items, offers, QR generation, the
admin dashboard, Excel import/export and analytics are Phase 1+.

- [`docs/GOALS.md`](docs/GOALS.md) — product invariants and the phased delivery plan.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — decisions of record and why.

---

## Quick start

Requirements: **Node 20.11+** (22 recommended), **Docker** (for Postgres), npm.

```bash
git clone <repo> && cd digital-menu
cp .env.example .env          # safe local defaults; no real secrets needed

docker compose up -d postgres # Postgres 16 on :5432
npm install
npm run db:migrate            # apply migrations
npm run db:seed               # deterministic demo data
npm run dev                   # http://localhost:3000
```

Then open:

| URL | What it is |
|---|---|
| `http://localhost:3000/m/DEM001` | Demo restaurant — Arabic and English content |
| `http://localhost:3000/m/DEM001?lang=en` | The same permanent URL, English |
| `http://localhost:3000/m/DEM002?lang=en` | Arabic-only business seen by an English visitor |
| `http://localhost:3000/m/DRAFT1` | A draft business — deliberately not public (404) |
| `http://localhost:3000/api/health` | Health/readiness report |

Already have Postgres locally? Skip the `docker compose` step and point `DATABASE_URL` at it.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (needs no secrets) |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest — unit + integration |
| `npm run test:e2e` | Playwright smoke journey (builds first: `npm run build`) |
| `npm run db:migrate` | Create/apply migrations in development |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:seed` | Deterministic seed (idempotent) |
| `npm run db:validate` | Validate the Prisma schema |
| `npm run db:status` | Migration status |
| `npm run db:generate` | Regenerate the Prisma client |

`npm run test:e2e` runs against `next start`, so build first. In sandboxes or CI images
with a preinstalled Chromium, point Playwright at it:
`PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium npm run test:e2e`.

## Environment

Every variable is validated at startup by `src/lib/env.ts`. Missing or malformed
configuration fails loudly and names the offending key — **without printing its value**.
Development gets safe localhost defaults; production is strict.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | always | PostgreSQL connection string |
| `SHADOW_DATABASE_URL` | dev only | Used by `prisma migrate dev` |
| `APP_URL` | defaulted | Origin serving admin and API |
| `PUBLIC_URL` | defaulted | Origin embedded in QR codes — treat as immutable once codes are printed |
| `AUTH_SECRET` | production | `openssl rand -base64 32`. The dev placeholder is rejected in production by name |
| `STORAGE_PROVIDER` | defaulted | `local` \| `r2` |
| `STORAGE_LOCAL_ROOT` | defaulted | Filesystem root for the local provider |
| `STORAGE_BUCKET` / `STORAGE_ENDPOINT` / `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` | if `r2` | Validated together |
| `REDIS_URL` | optional | Never required for local development |
| `ANALYTICS_SALT` | Phase 7 | Derives non-reversible visitor hashes |

`.env` is gitignored. `.env.example` holds placeholders only — no real secret belongs in
this repository.

## Database

PostgreSQL 16 via Prisma 7. The schema is in `prisma/schema.prisma`; migrations are
committed SQL in `prisma/migrations/` and are the only way the schema changes.

Phase 0 models: `User`, `Business` (the tenant), `BusinessMembership`, `BrandTheme`,
`Menu`, `MenuVersion`. Branches, categories, items, offers, files, QR records, analytics
and import batches arrive with the phases that need them.

The seed is deterministic and idempotent — fixed public ids and slugs, upserts throughout,
so re-running is safe and E2E tests can navigate to literal URLs. It seeds **no invented
prices or calories** and no password.

## Docker

```bash
docker compose up -d postgres            # development: database only
AUTH_SECRET=$(openssl rand -base64 32) \
  docker compose --profile app up --build  # verify the production image locally
```

The `Dockerfile` is multi-stage and produces a standalone runtime image with no toolchain,
no source and no dev dependencies, running as a non-root user with a `HEALTHCHECK` on
`/api/health`. **No secret is needed at image build time** — configuration is validated on
first request, so the same image is built once in CI and configured at deploy.

The dev server intentionally runs on the host rather than in a container; containerising
it would cost fast refresh for no benefit.

## Arabic / English and RTL / LTR

Arabic is the primary authored language and the platform default. English is a peer, not a
translation pass.

**Locale never appears in the URL.** A printed QR must resolve to a byte-identical path
forever, so locale resolves from `?lang=` → cookie → `Accept-Language` → the business's
default → Arabic. `src/proxy.ts` negotiates it and writes it onto the request, so the first
response already carries the right `lang`/`dir` — no post-hydration flip. Switching
language rewrites one search parameter, which is what keeps page context intact.

**Interface strings** live in `src/i18n/dictionaries/*.json`; English is typed against the
Arabic shape, so a missing key is a build error, never a raw key shown to a visitor.

**Business content** lives in explicit `*_ar` / `*_en` columns. `resolveContent` returns
the text *plus the locale it was authored in*, so an Arabic-only name shown to an English
visitor is rendered as Arabic with correct `lang`/`dir` rather than machine-translated. The
platform never fabricates a translation.

**RTL is native**, not mirrored: stylesheets use logical properties only
(`margin-inline`, `padding-inline`, `text-align: start`). A unit test fails the build if a
physical directional property appears in a template stylesheet, and the E2E suite asserts
the computed `direction` in both languages.

## Project structure

```
prisma/
  schema.prisma            core schema
  migrations/              committed SQL
  seed.ts                  deterministic demo data
src/
  app/
    m/[publicId]/          THE permanent public profile route
    api/health/            health + readiness
    layout.tsx             sets lang/dir from negotiated locale
  design/
    tokens.css             system tokens (--sys-*)
    brand.ts               business tokens (--brand-*) + contrast maths
  i18n/
    config.ts              locale resolution, direction, switcher hrefs
    content.ts             bilingual business content, no fabricated translations
    dictionary.ts          interface strings
    format.ts              locale-aware price/calorie/date formatting
  lib/
    env.ts                 validated configuration — the only reader of process.env
    public-id.ts           opaque public identifiers
  server/
    db/client.ts           lazy Prisma client
    profile/               public profile read model
    storage/               StorageProvider abstraction + local implementation
    tenancy/context.ts     server-side tenant isolation
  templates/
    registry.ts            template catalogue (code, not database rows)
    editorial/             one template family: structure + styles
  proxy.ts                 locale negotiation
tests/unit, tests/integration, e2e/
docs/GOALS.md, docs/ARCHITECTURE.md
```

## Contributing notes

Three rules carry more weight than the rest, because breaking them contradicts the product
rather than the code:

1. **Never change what a QR resolves to.** `/m/{publicId}` is permanent. No locale
   segment, no template in the path, no id rotation.
2. **Never trust a client-supplied business id.** Go through
   `resolveTenantContext` / `tenantScope`.
3. **Never hard-code a business colour, font or copy string in a component.** Brand
   arrives as `--brand-*`; content arrives from the database in both languages.
