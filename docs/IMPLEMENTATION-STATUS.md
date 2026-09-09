# Implementation Status

**The single source of truth for what is built.** If another document disagrees
with this one, this one is right and the other is stale.

**Last fully verified release:** 2026-09-09, against PostgreSQL 16.13 and a
production build.

Statuses: **DONE** · **IN PROGRESS** · **BLOCKED** · **NOT STARTED**

> `DONE` means implemented and verified. `IN PROGRESS` may mean the code is
> complete enough for review but the current environment has not executed the
> required build/integration/live-provider proof yet.

---

## Verification state

Executed 2026-09-09 on a clean clone against a real PostgreSQL 16.13:

| Check | Result |
|---|---|
| `npm ci` on a clean clone | **PASS** |
| `npm run lint` | **PASS** |
| `npm run typecheck` | **PASS** |
| `npm run db:validate` | **PASS** |
| `npm run db:deploy` | **PASS** — 19 migrations |
| `npm run db:status` | **PASS** — no drift |
| `npm test` with `REQUIRE_DATABASE=1` | **PASS** — 731 passed, 0 skipped |
| `npm run build` | **PASS** |
| `npx playwright test` (production build) | **PASS** — 110 passed |
| Railway deployment of `claude/goals-ohhrg2` | **PASS** — migrations applied, health check green |
| Production browser smoke tests | **BLOCKED** — see below |

### What the 2026-09-09 pass fixed before it could run

The branch did not build. `package-lock.json` had been overwritten with
truncated tool output — a capture banner plus the first 3,578 of 11,390 lines
— so `npm ci` rejected it and no Docker build, and therefore no Railway
deploy, could install dependencies. Three type errors then blocked `tsc` and
`next build`. Both are fixed; the lockfile was restored from the last intact
revision and still matches `package.json` exactly.

### Production browser smoke tests: BLOCKED

This environment's egress policy refuses `menu.norivaglobal.com` and
`digital-menu-production-2b95.up.railway.app` at the proxy (403 on CONNECT).
That is an organisation policy decision, not a statement about the site, and
it cannot be worked around from here. What was verified instead:

- Railway-side: the deployment reached SUCCESS with `railway.json`'s
  `/api/health` health check configured, which Railway probes before promoting
  a deployment, and the deploy log shows migrations applied and the server
  listening.
- Browser-side: the full 110-test Playwright suite against a local production
  build, which exercises the same code through a real Chromium.

A browser session from an unrestricted network is still required to close the
production smoke tests.

## Platform

| Area | Status | Notes |
|---|---|---|
| Authentication, sessions, password reset | **DONE** | scrypt; rate-limited per account and per client |
| RBAC, staff accounts, grants | **DONE** | Enforced in services, so routes cannot bypass it |
| Tenant isolation | **DONE** | Scope resolved before querying, not filtered after |
| Database schema and migrations | **DONE** | additive migration history |
| Security headers, CSP | **DONE** | Verified against a running production build |
| Rate limiting | **DONE** | In-process — see Scaling |
| Health endpoint | **DONE** | Application, database and storage reported separately |
| Audit logging | **DONE** | |
| Docker, entrypoint, Railway config | **DONE** | Migrations run in the serving container |
| CI workflow definition | **DONE** | The gate itself is correct: Postgres service, validate/deploy/status, seed, lint, typecheck, the full suite under `REQUIRE_DATABASE=1`, production build and Playwright |
| CI runner execution | **BLOCKED** | Every run since at least `38038d5` fails ~2s after the `verify` job starts, and the log blob 404s. The job is created and assigned to `ubuntu-latest`, so the workflow file parses; a runner that dies this early with no retrievable log is an account-level condition — Actions billing/spending limit or a restriction on the repository — not something a change to this repository can fix. The repository owner needs to check GitHub → Settings → Billing → Actions. Until then the release gate has to be executed manually, as it was on 2026-09-09 |

## Content and publishing

| Area | Status | Notes |
|---|---|---|
| Business, branch, menu, category, item CRUD | **DONE** | |
| Modifier groups and options | **DONE** | Can express sizes; not a first-class variant type |
| Offers, with HERO / BANNER / SECTION placements | **DONE** | Three distinct designs per family |
| Working hours, timezone-aware | **DONE** | Midnight-crossing intervals handled |
| Menu scheduling | **DONE** | |
| Service mode | **DONE** | |
| Draft / live separation | **DONE** | |
| Version snapshots, comparison, rollback | **DONE** | |
| Client preview links and approval | **DONE** | |
| Profile Health | **DONE** | Every finding carries a working fix link |
| Agency dashboard (needs attention) | **DONE** | |
| Excel import: mapping, conflicts, preview, rollback | **DONE** | |
| Export | **DONE** | |
| Price history and audit screens | **DONE** | |
| Nutrition fields | **DONE** | Never invented; missing data reported as missing |

## Public profile

| Area | Status | Notes |
|---|---|---|
| Ten template families | **DONE** | Proven distinct in DOM, metrics and palette |
| Brand engine and per-business theming | **DONE** | Contrast-corrected variants |
| Arabic / English, RTL / LTR | **DONE** | Designed for both, not CSS-flipped |
| Self-hosted typography, per-script subsets | **DONE** | Six OFL families |
| Responsive 320px → large desktop | **DONE** | No horizontal overflow at verified target widths |
| SEO: metadata, canonical, hreflang, OG, sitemap, robots | **DONE** | Not verified against current production URLs |
| Printable menu and PDF | **DONE** | Arabic glyph mapping asserted in generated PDF |
| QR permanence | **DONE** | |
| QR print kit | **DONE** | Table tent, counter card, A4, A5, QR-only |
| Analytics capture and reporting | **DONE** | Owner previews excluded |
| Public menu search / filter | **DONE** | Offered from six items up; template-agnostic; Arabic folded |
| Per-menu public address | **DONE** | `/m/{publicId}/menu/{menuKey}`, own title, canonical and OG |
| Website embedding | **DONE** | `/embed/...`, cross-origin framable, self-sizing, `noindex` |

## Media

| Area | Status | Notes |
|---|---|---|
| Upload validation, dedupe, generated keys | **DONE** | Three-way type check |
| Derivatives, srcset, focal points, lazy loading | **DONE** | Generated at upload |
| Bilingual authored alt text | **DONE** | Never generated from a filename |
| Media Studio: crop, focal, metadata, orphans, quality | **DONE** | |
| Demo imagery | **DONE** | Original demo artwork across distinct businesses |
| **Image ZIP import** | **DONE** | Read-only preview, `item_id` filename mapping, SHA-256 preview binding, per-item atomic assignment through the existing media pipeline, and a new/replaced/skipped/failed report. Unit, database-backed integration and browser coverage all executed 2026-09-09. |

## Admin experience

| Area | Status | Notes |
|---|---|---|
| Guided onboarding | **DONE** | Resumable; shows completion and next step |
| Global search | **DONE** | Works without JavaScript |
| Command palette (`Ctrl/⌘ K`) | **DONE** | Native dialog, keyboard-tested |
| Link Health | **DONE** | With tested SSRF guard |
| Explicit save with pending state | **DONE** | |
| Links, QR & embed screen | **DONE** | Profile, branch and per-menu links with embed snippets |
| Duplicate menu / section / item | **DONE** | Copies are drafts; item codes rewritten |
| Reorder sections and items | **DONE** | Server actions, keyboard/phone friendly |
| True autosave | **DONE** | 900ms debounce, visible dirty/saving/saved/failed states, an explicit Save/Retry, and serialized writes so a slow request cannot land after a newer one. Note it saves *presentation*, which is live on publish-independent grounds: publishing gates menu content, a design change is not content. Browsing the Theme Library is the one design act that is not saved, deliberately |
| Undo / redo | **DONE** | Theme, layout, typography, photography, density and display history through the serialized draft queue |

## API and integration

| Area | Status | Notes |
|---|---|---|
| `/api/v1` read surface | **DONE** | Authenticated, rate-limited, tenant-scoped |
| API keys | **DONE** | Existing hashed keys preserved; explicit Read-only vs Read+Write issuance and display. |
| **Item write API** | **DONE** | Scoped `POST`, `PATCH`, `DELETE` item handlers. Requires `write` scope, validates tenant/menu/category boundaries, audits machine actor and price changes, invalidates profile cache, and never auto-publishes. |
| Broader API write surface | **NOT STARTED** | Business/menu/category/offer mutation endpoints are not yet exposed; do not describe the API as full CRUD. |

## Operations

| Area | Status | Notes |
|---|---|---|
| Documentation set | **DONE** | This file is the status source of truth |
| **R2 / S3-compatible storage provider** | **IN PROGRESS** | SigV4 PUT/GET/HEAD/DELETE, public URLs, presigned private GET and a write/read/delete probe, with no SDK dependency. Configuration validation and mocked unit tests pass. Production runs `STORAGE_PROVIDER=local` on a 5GB Railway volume; no R2 credentials are configured, so no live round-trip has happened. Needs `STORAGE_BUCKET`, `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` and `STORAGE_PUBLIC_BASE_URL` before it can be selected. |
| **Shared-store rate limiting** | **NOT STARTED** | The limiter is in-process. A Redis service is provisioned and `REDIS_URL` is set in production, but no code reads it, so a second replica would keep independent buckets. Production runs one replica, which is what makes the current limiter correct today and a blocker for scaling out |
| **Automated backups** | **NOT STARTED** | Procedure exists; no scheduled/rehearsed automated backup is proven |
| **Error monitoring** | **NOT STARTED** | Structured stdout only; no external error-monitoring service is proven |
| **Live deployment** | **DONE** | `claude/goals-ohhrg2` deployed 2026-09-09; migrations applied, health check green |
| **Production browser smoke tests** | **BLOCKED** | This environment's egress policy refuses the production hosts at the proxy |

---

## 2026-09-09 verification work

Found and fixed while verifying, each with a regression test:

- **The branch could not build.** A truncated `package-lock.json` broke
  `npm ci`, and with it every Docker build and Railway deploy.
- **Previewing a theme changed what customers saw.** A menu's design is live
  the moment it is saved — publishing gates content, not presentation — and
  the Theme Library's cards wrote through autosave while calling themselves
  "Preview". Previewing and applying are now separate acts, and the preview
  route's existing write-free override is what backs it.
- **Previewing discarded the operator's own choices.** `withPreviewTheme`
  passed null for typography, photography and density, so the centre preview
  never showed them at all. The read model now carries the stored overrides.
- **The preview went stale after the first save**, because its iframe was
  keyed on a message that never changes.
- **A ZIP bomb could take the container down.** Both size guards read the
  size the archive declares; an entry declaring 12 bytes while carrying
  200KB of deflated zeros expanded to 200MB before rejection. The inflate is
  now bounded.
- **A failed image aborted the rest of the import.** Assignment is now per
  item, and reports new, replaced, skipped and failed.

---

## Next, in order

1. Run production browser smoke tests from an unrestricted network across
   admin, Studio, AR/EN, QR/public menu, spreadsheet import and image ZIP.
2. Run a real R2 credential round-trip through `probe()` before selecting R2.
3. Add and rehearse automated PostgreSQL + object-storage backups/restore.
4. Add shared-store rate limiting before running more than one replica.
5. Connect production error monitoring.
6. Expand API write coverage only for resources integrations genuinely need.
