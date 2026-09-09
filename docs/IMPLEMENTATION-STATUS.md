# Implementation Status

**The single source of truth for what is built.** If another document disagrees
with this one, this one is right and the other is stale.

**Last verified:** 2026-09-07, against a real PostgreSQL 16 with all migrations
applied and a production build.

Statuses: **DONE** · **IN PROGRESS** · **BLOCKED** · **NOT STARTED**

---

## Verification state

| Check | Result |
|---|---|
| `npm ci` on a clean clone | **PASS** |
| `npm run lint` | **PASS** |
| `npm run typecheck` | **PASS** |
| `npm test` (unit + integration) | **PASS** — 681 passed, **0 skipped** |
| `npm run build` | **PASS** |
| `npx playwright test` (E2E, production build) | **PASS** — 104 passed |
| `prisma migrate deploy` | **PASS** — 18 migrations, no drift |
| Live production deployment | **PASS** — deployed 2026-09-07, migrations applied |
| Production browser smoke tests | **BLOCKED** — this environment cannot reach the production host |

> Integration and E2E were previously **BLOCKED** for want of a database, with
> 167 tests skipping silently. Both now run. CI enforces it with
> `REQUIRE_DATABASE=1`, so a missing database fails the run rather than
> removing a third of the suite from it.

---

## Platform

| Area | Status | Notes |
|---|---|---|
| Authentication, sessions, password reset | **DONE** | scrypt; rate-limited per account and per client |
| RBAC, staff accounts, grants | **DONE** | Enforced in services, so routes cannot bypass it |
| Tenant isolation | **DONE** | Scope resolved before querying, not filtered after |
| Database schema and migrations | **DONE** | 30 tables, 17 migrations, all additive |
| Security headers, CSP | **DONE** | Verified against a running production build |
| Rate limiting | **DONE** | In-process — see Scaling |
| Health endpoint | **DONE** | Application, database and storage reported separately |
| Audit logging | **DONE** | |
| Docker, entrypoint, Railway config | **DONE** | Migrations run in the container that serves |
| CI | **DONE** | Postgres service, full suite including E2E |

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
| Agency dashboard ("needs attention") | **DONE** | |
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
| Responsive 320px → large desktop | **DONE** | No horizontal overflow at any target width |
| SEO: metadata, canonical, hreflang, OG, sitemap, robots | **DONE** | Not verified against production URLs |
| Printable menu and PDF | **DONE** | Arabic glyph mapping asserted in the generated PDF |
| QR permanence | **DONE** | |
| QR print kit | **DONE** | Table tent, counter card, A4, A5, QR-only |
| Analytics capture and reporting | **DONE** | Owner previews excluded |
| **Public menu search / filter** | **DONE** | Offered from six items up; template-agnostic; Arabic folded |
| **Per-menu public address** | **DONE** | `/m/{publicId}/menu/{menuKey}`, own title, canonical and OG |
| **Website embedding** | **DONE** | `/embed/...`, cross-origin framable, self-sizing, `noindex` |

## Media

| Area | Status | Notes |
|---|---|---|
| Upload validation, dedupe, generated keys | **DONE** | Three-way type check |
| Derivatives, srcset, focal points, lazy loading | **DONE** | Generated at upload |
| Bilingual authored alt text | **DONE** | Never generated from a filename |
| Media Studio: crop, focal, metadata, orphans, quality | **DONE** | |
| **Demo imagery** | **DONE** | 67 original brand artworks across 8 businesses |
| **Image ZIP import** | **NOT STARTED** | Excel image *mapping* exists; the archive path does not |

## Admin experience

| Area | Status | Notes |
|---|---|---|
| Guided onboarding (11 steps) | **DONE** | Resumable; shows what is complete and what is missing |
| Global search | **DONE** | Works without JavaScript |
| **Command palette (`Ctrl/⌘ K`)** | **DONE** | Native `<dialog>`, keyboard-only tested |
| **Link Health** | **DONE** | With a tested SSRF guard |
| Explicit save with pending state | **DONE** | |
| **Links, QR & embed screen** | **DONE** | Profile, branch and per-menu links with copy-paste embed snippets |
| **Duplicate menu / section / item** | **DONE** | Copies are drafts; item codes rewritten; a copied dish arrives hidden |
| **Reorder sections and items** | **DONE** | Up/down server actions — works with no JavaScript, keyboard and phone |
| **True autosave** | **DONE** | Draft-only, 900 ms debounce, visible dirty/saving/saved/failed states, retry, and serialized writes prevent stale-request overwrite |
| **Undo / redo** | **NOT STARTED** | Price history and rollback mitigate the worst case |

## API and integration

| Area | Status | Notes |
|---|---|---|
| `/api/v1` read surface | **DONE** | Authenticated, rate-limited, tenant-scoped |
| API keys | **DONE** | |
| **`/api/v1` write surface** | **NOT STARTED** | No `POST`/`PATCH`/`DELETE` handler exists |

## Operations

| Area | Status | Notes |
|---|---|---|
| Documentation set | **DONE** | This file is the status source of truth |
| **R2 / S3 storage provider** | **NOT STARTED** | Throws rather than silently degrading |
| **Shared-store rate limiting** | **NOT STARTED** | In-process; blocks a second replica |
| **Automated backups** | **NOT STARTED** | Procedure documented in the runbook; nothing scheduled |
| **Error monitoring** | **NOT STARTED** | Errors reach stdout only |
| **Live deployment + smoke tests** | **NOT RUN** | |

---

## Fixed in the most recent pass

Defects found by *running* the system, each with a regression test that fails
when the fix is reverted:

| Defect | Impact |
|---|---|
| 125 dead `--brand-*` token references across all ten families | Offer, hours and badge styling rendered in inherited near-black on every profile, in production, silently |
| Media URLs carried the internal database cuid | Published an internal id on every profile; allowed cross-profile tenant correlation |
| `.admin a` outweighed component classes | The nav link for the current page was accent-on-accent — the one sidebar item that could not be read |
| White on yellow at 1.82:1 on the bold offer panel | Failed WCAG AA |
| Hero text legible only because the demo artwork was dark | Would have failed the first time an operator uploaded a pale photograph |
| Hours badges broken in whichever state was not rendering | The defect depended on the hour of day; both halves shipped broken at different points |
| Accent text at 4.16–4.49:1 on tinted surfaces | Failed WCAG AA |
| The contrast harness read alpha backgrounds as solid | Produced false failures, obscuring real ones |

---

## Next, in order

1. **Production browser smoke tests** — the deployment is live and migrated;
   what has never been done is opening it in a browser and working the
   checklist in `PRODUCTION-RUNBOOK.md`.
2. **Backups** — a platform holding client menus and uploaded media with no
   rehearsed restore is one volume failure from losing work.
3. **R2 storage provider** — required before a second application node.
4. Error monitoring, then autosave, then undo/redo, then the API write
   surface.
