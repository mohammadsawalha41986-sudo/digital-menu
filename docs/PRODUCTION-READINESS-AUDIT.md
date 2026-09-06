# Production Readiness Audit

**Date:** 2026-09-06
**Commit range audited:** `2dbcaf2` … `84f0f39` (branch `claude/digital-menu-production-oih46i`)
**Method:** the repository was read, then *run*. A PostgreSQL 16 instance was
provisioned, all 17 migrations applied, the seed executed, and every suite —
unit, integration, build and end-to-end — run against a production build.
Findings below distinguish what was read from what was observed.

---

## Executive summary

This is a mature codebase, not a scaffold: ~108,000 lines across a Next.js 16
application with ten template families, a Prisma/PostgreSQL domain model of
30 tables, 17 migrations, and 69 test files. Authentication, RBAC, tenant
isolation, publishing, versioning, rollback, client approval, Excel import,
analytics, QR permanence and the print/PDF path are all genuinely implemented,
not stubbed.

The audit's single most consequential finding is not a missing feature. It is
that **the previous verification state was unknown rather than good**. The
handover document recorded integration and E2E as `BLOCKED — no database`, and
167 of 624 tests were being skipped. Standing a database up moved every one of
those from *unknown* to *passing* — and immediately surfaced three defects that
had been invisible precisely because nothing was exercising them.

Those three, in order of severity:

1. **The brand colour tokens never applied.** Ten template families made 125
   references to custom properties (`--brand-accent`, `--brand-text`,
   `--brand-muted`) that the brand layer has never emitted; it emits
   `--brand-color-*`. CSS custom properties fail silently, so offer heroes,
   hours tables and badges rendered in inherited near-black on every profile,
   in production, with nothing reporting a problem.
2. **Public image URLs carried the internal database id.** Media storage keys
   were namespaced by the business cuid, and media URLs are rendered into every
   public profile. An integration test already asserted this invariant and had
   been passing only because no seeded profile had an image to leak.
3. **Contrast failures across every template family**, unmasked once the brand
   tokens resolved: white type on a yellow offer panel at 1.82:1, hero text
   legible only because the demo artwork happened to be dark, and two
   open/closed badges whose broken half depended on the hour of day.

All three are fixed, each with a regression test that fails when the fix is
reverted.

The product-quality finding of equal weight: **the demo businesses had no
images at all** — no logo, no cover, no item photography — while every template
renders image slots. What a visitor saw was a menu of empty frames.

Current state: **the full gate is green** — 670 unit and integration tests,
90 E2E against a production build, lint and typecheck clean, all migrations
applied with no drift. What remains is listed honestly in
[Missing features](#missing-features) and is, without exception, feature work
rather than defect work.

---

## Current architecture

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router), React 19 | `output: standalone`; server components by default |
| Language | TypeScript 5.9, strict | `tsc --noEmit` clean |
| Data | PostgreSQL 16 via Prisma 7 (`@prisma/adapter-pg`) | 30 tables, 17 migrations |
| Auth | First-party sessions, cookie-based | Gate in the dashboard *layout*, not middleware, so it can check the account still exists |
| Tenancy | `requireTenantContext(user, businessId, role)` | Resolved before queries, not filtered after |
| Storage | `StorageProvider` abstraction | `local` implemented; `r2` throws "not implemented" |
| Templates | Ten families + shared sections | Per-business brand tokens injected inline |
| i18n | Arabic / English, first-class | Six self-hosted OFL families, per-script subsets |
| Testing | Vitest (unit + integration), Playwright (E2E) | CI provisions Postgres and fails if it is absent |
| Deploy | Docker + Railway | `railway.json`, `Dockerfile`, entrypoint runs migrations |

Two structural decisions deserve praise, because they are what made this audit
tractable. Authorisation lives in the *services*, so no route or action can
skip it. And the public read model is a deliberate projection rather than a
serialised ORM object — which is why a test could assert "no internal id
reaches the render layer" at all.

---

## Implemented features

Verified by reading the implementation **and** exercising it.

| Area | State | How it was verified |
|---|---|---|
| Authentication, sessions, password reset | Working | E2E signs in, sets a real cookie |
| RBAC and staff management | Working | Integration: `staff-management.test.ts` |
| Tenant isolation | Working | Integration: `tenant-isolation.test.ts`; preview route refuses another tenant |
| Business / menu / category / item CRUD | Working | E2E full journey writes and reads back |
| Publishing and version snapshots | Working | Integration: `menu-versions.test.ts` |
| Rollback | Working | E2E `full-journey` restores a version |
| Draft / live separation | Working | Draft business is 404 publicly, previewable by staff |
| Client preview links and approval | Working | Integration: `client-review.test.ts` |
| Profile Health and the attention dashboard | Working | Rendered, scored, every finding carries a fix link |
| QR permanence | Working | Integration: `qr-permanence.test.ts` |
| QR print kit (table tent, A4/A5, SVG/PNG) | Working | E2E downloads and checks content type |
| Printable menu and PDF | Working | E2E asserts complete Arabic glyph mapping in the generated PDF |
| Excel import, mapping, conflicts, rollback | Working | Integration: `import-export.test.ts` |
| Analytics capture and reporting | Working | Integration: `analytics.test.ts`; owner previews excluded |
| Media pipeline (validation, derivatives, focal points) | Working | Integration: `media.test.ts`; now exercised by the seed |
| Ten template families, visually distinct | Working | E2E `design-qa` asserts differing DOM, metrics and palettes |
| Arabic / English, RTL / LTR | Working | E2E in both directions on every demo |
| Self-hosted typography | Working | E2E measures each family against a missing font |
| Security headers, CSP | Working | E2E asserts headers and that no external origin is permitted |
| Rate limiting and brute-force protection | Working | Unit: `rate-limit.test.ts` |
| Read API (`/api/v1`) | Working | Integration: `api.test.ts` |
| Health endpoint | Working | Reports application, database and storage separately |
| **Demo imagery** | **Added this pass** | 67 original brand artworks across 8 businesses |
| **Command palette** | **Added this pass** | E2E, keyboard-only |
| **Link Health + SSRF guard** | **Added this pass** | 26 unit tests; probe tested against a live server |

---

## Partial features

| Feature | What exists | What is missing |
|---|---|---|
| Object storage (§32) | The `StorageProvider` abstraction, cleanly used everywhere | The `r2` provider itself throws "not implemented". Local disk works and is what Docker persists to. |
| Autosave (§23) | Explicit save with a pending state (`Saving…`) in the studio and builder | No timer-driven save; no "Failed to save" retry affordance |
| Analytics (§27) | Full capture, per-event reporting, device/language/referrer breakdowns | The *insight* layer — "burgers are 41% of menu views" is computable from what is stored but not stated |
| Menu variants (§17) | Modifier groups and options with price deltas, which can express sizes | No first-class variant concept; an operator models "Small/Medium/Large" as a modifier group |

---

## Missing features

Ordered by product value. None of these is a defect; all are unbuilt scope.

| # | Feature | Spec | Assessment |
|---|---|---|---|
| 1 | **Public menu search / filter** | §18 | The admin has global search; the *visitor* has none. On a long menu this is the biggest remaining usability gap. |
| 2 | **Undo / redo in editors** | §24 | Nothing exists. Price history and version rollback mitigate the worst case. |
| 3 | **True autosave** | §23 | See above. |
| 4 | **R2 / S3 storage provider** | §32 | Blocks horizontal scaling: local disk means one writable node. |
| 5 | **API write surface** | §35 | `/api/v1` is read-only. No `POST`/`PATCH`/`DELETE` handler exists. |
| 6 | **Image ZIP import** | §34 | Not started. The Excel importer's image *mapping* exists; the archive path does not. |
| 7 | **First-class product variants** | §17 | See above. |
| 8 | **Analytics insight statements** | §27 | See above. |

---

## Security findings

A review of the authorisation, upload, fetch and session surfaces.

| # | Severity | Finding | Status |
|---|---|---|---|
| S1 | **High** | Public image URLs embedded the internal business cuid, published on every profile and enabling cross-profile tenant correlation | **Fixed.** Keys are namespaced by the public id. The uploads route resolves by exact stored key, so existing media keeps working without a migration. |
| S2 | Medium | Link Health introduces server-side fetching of operator-supplied URLs — SSRF by construction | **Mitigated at introduction.** Scheme and port allowlists, resolved-address checks against all private/reserved ranges (v4 and v6, including `::ffff:` and 6to4/NAT64), per-hop redirect re-checks, and bounds on time, hops and bytes. 26 unit tests. |
| S3 | Low | DNS rebinding remains possible between the check and the connection | **Accepted and documented.** Closing it requires connecting to the checked address with the Host header preserved, which the platform `fetch` does not expose. A probe returns a status class and never response content, so a successful rebind yields "this address answered". See `docs/SECURITY.md`. |
| S4 | Low | Link checking could be used to point platform traffic at a third party | **Mitigated.** Sequential rather than parallel, capped at 24 links per run, rate-limited to one run per business per minute. |
| S5 | Informational | Dependency advisories: `mysql2` (transitive via `prisma`), `deepmerge-ts` (via `@prisma/config`), `uuid` (via `exceljs`) | **Open, not exploitable here.** `mysql2` is unreachable — the app uses the `pg` adapter. Resolution requires upstream releases. |

Verified as already sound, not merely assumed:

- Authorisation is enforced in services, so actions and routes cannot bypass it.
- Tenant scope is resolved **before** querying, including in global search.
- Uploads validate declared type, extension and magic bytes together; storage
  keys are generated and nonce-suffixed, so a crafted filename can neither
  escape the tenant namespace nor overwrite an object.
- The uploads route is not an open file server: it requires a `Media` row, an
  `ACTIVE` business or a staff grant, and serves only pre-generated derivative
  widths — it cannot be turned into an on-demand resizer.
- Login is rate-limited per account *and* per client, with identical messages
  for a wrong password and an unknown address.
- CSP permits no external origin; framing is same-origin, not forbidden
  outright, so the admin's own previews work.

---

## UX findings

| # | Finding | Status |
|---|---|---|
| U1 | The sidebar link for the page you were on was accent-on-accent — the current page was the one item you could not read | **Fixed** (see D2) |
| U2 | No way to reach a business or dish without remembering which profile owns it | **Fixed** — command palette |
| U3 | External links were listed nowhere and checked never | **Fixed** — Link Health |
| U4 | Visitors cannot search a long menu | **Open** (§18) |
| U5 | Editors have no undo | **Open** (§24) |

---

## UI findings

| # | Finding | Status |
|---|---|---|
| D1 | 125 dead brand-token references across all ten families; offer, hours and badge styling silently inherited near-black | **Fixed**, with `tests/unit/brand-tokens.test.ts` as the guard |
| D2 | `.admin a:not(.admin__button)` outweighs a single component class; fixed once for buttons by exclusion, recurred on the active nav link | **Fixed structurally** with `:where()`, so specificity is zero and no future component needs an exclusion |
| D3 | Demo businesses had zero imagery | **Fixed** — 67 original brand artworks |
| D4 | Luxury and dark hero text was legible only because the demo image was dark | **Fixed** — opaque scrim under a taller image; legibility no longer depends on the picture |

---

## Accessibility findings

| # | Finding | Status |
|---|---|---|
| A1 | White on the bold family's yellow offer panel: 1.82:1 | **Fixed** — accent fills take `--brand-color-on-accent` |
| A2 | Hours badges failed in whichever state was *not* rendering, so the bug depended on the hour of day (1.82:1 open, ~4:1 closed) | **Fixed** in three families; the sweep now flips `data-open` and measures both states |
| A3 | Accent used as text on tinted surfaces landed at 4.16–4.49:1 | **Fixed** — readable variants solved to 5.5:1 for headroom; `readableForeground` falls back to the extreme when the softened pair cannot clear the target |
| A4 | The contrast harness read a 20%-alpha chip as solid, producing false failures | **Fixed** — it composites alpha the way the compositor does |
| A5 | The admin surface was never measured at all | **Fixed** — `e2e/admin-contrast.spec.ts` |

Verified sound: keyboard operation of the palette (native `<dialog>`), reduced-motion
respected, no horizontal overflow at 320–430px, item details open without JavaScript,
alt text authored per language and never generated from a filename.

---

## Performance findings

- Images ship with explicit `width`/`height`, `srcset`, `sizes`, lazy loading
  and focal-point `object-position`. No layout shift by construction.
- Derivatives are generated at upload, not on first request, so the first
  visitor after a deploy does not pay for them.
- The uploads route serves only widths that were actually generated — it cannot
  be driven as an image-resizing amplifier.
- 67 seeded images across 8 businesses total 2.0 MB including all derivatives.
- **Not measured:** no Lighthouse or field data was collected. Statements above
  are structural, not empirical.

---

## SEO findings

Verified present: per-locale title and description, canonical, `hreflang`
alternates, Open Graph (now with a real image for every demo), robots and
sitemap routes, and `indexProfile` honoured per business. **Not verified
against production URLs** — see [Deployment findings](#deployment-findings).

---

## Test findings

| Suite | Before this pass | After |
|---|---|---|
| Unit + integration | 457 passed, **167 skipped** (no database) | **670 passed, 0 skipped** |
| Build | Passing | Passing |
| E2E | **BLOCKED** — no database, no browser | **90 passed** against a production build |
| Lint / typecheck | Clean | Clean |
| Migrations | Not applied in any environment | **17 applied, no drift** |

The 167 skipped tests were the integration suite — precisely the tests covering
tenant isolation, media, publishing and the API. CI already guards against this
regressing: `REQUIRE_DATABASE=1` makes a missing database fail the run rather
than quietly removing a third of the suite from it.

Tests added this pass: 46 (26 for the SSRF address policy and probe, 14 for the
artwork generator, 3 for brand tokens, plus 3 E2E specs covering the palette,
Link Health and admin contrast).

---

## Deployment findings

| Item | State |
|---|---|
| Dockerfile, entrypoint, compose | Present; entrypoint runs `migrate deploy` before boot |
| `railway.json` | Present |
| Health endpoint | Reports application, database and storage separately |
| Migrations | Additive; no destructive operation in any of the 17 |
| Environment validation | `src/lib/env.ts` refuses to boot in production on a missing or placeholder secret |
| **Live deployment** | **Not performed this pass.** No deployment was triggered and no production URL was exercised. |
| Backups | No documented backup or restore procedure |
| Error monitoring | No integration; errors go to stdout |

One inconsistency worth noting: `next.config.ts` sets `output: 'standalone'`,
and `next start` warns that this is unsupported — the correct command is
`node .next/standalone/server.js`. The Dockerfile does the right thing; the
Playwright web server and any manual `npm start` do not. Harmless in test, worth
aligning.

---

## Data and media findings

| Finding | Status |
|---|---|
| Zero media rows across all demo businesses | **Fixed** — 67 images, all through the real upload pipeline |
| No placeholder or fake image URLs anywhere | Confirmed |
| Demo content is realistic, bilingual and labelled as demo data | Confirmed — no lorem ipsum |
| Calories seeded only where a business would plausibly have measured them | Confirmed, and never invented |
| Artwork is abstract brand art, not photography, and the alt text says so in both languages | By design — see `docs/MEDIA.md` |

---

## Documentation findings

Before this pass: 24 documents, several describing work as remaining that had
since been completed, and `IMPLEMENTATION-STATUS.md` carrying a "Remaining"
list whose first four entries were already done. There was no single source of
truth.

Fixed: `IMPLEMENTATION-STATUS.md` is now the one status document, and the
required set (`SECURITY.md`, `TESTING.md`, `MEDIA.md`, `PRODUCTION-RUNBOOK.md`)
exists.

---

## Priority matrix

| | **Low effort** | **High effort** |
|---|---|---|
| **High impact** | ~~Brand token fix~~ ✅<br>~~Admin nav contrast~~ ✅<br>~~Media URL id leak~~ ✅ | ~~Demo imagery~~ ✅<br>~~Command palette~~ ✅<br>**Public menu search**<br>**R2 storage provider** |
| **Low impact** | Align `next start` with `output: standalone`<br>Analytics insight statements | Undo/redo<br>API write surface<br>ZIP image import<br>First-class variants |

---

## Recommended execution order

1. ~~Establish a verified baseline: database, migrations, every suite.~~ **Done.**
2. ~~Fix what the baseline exposed: brand tokens, the id leak, contrast.~~ **Done.**
3. ~~Give the demos imagery, so the product can be judged as a product.~~ **Done.**
4. ~~Command palette and Link Health.~~ **Done.**
5. **Public menu search** — the largest remaining visitor-facing gap.
6. **R2 storage provider** — required before more than one application node.
7. **Deploy and run the production smoke tests**, which have never been run.
8. Autosave, then undo/redo, then the API write surface.

Steps 1–4 are complete and verified. Step 7 is the one that stands between this
codebase and an honest claim of production readiness; see
`docs/FINAL-PRODUCTION-READINESS-REPORT.md`.
