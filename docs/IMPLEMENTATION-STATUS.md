# Implementation Status

**The single source of truth for what is built.** If another document disagrees
with this one, this one is right and the other is stale.

**Last fully verified release:** 2026-09-07, against PostgreSQL 16 and a
production build. **Current branch implementation updated:** 2026-09-09.

Statuses: **DONE** · **IN PROGRESS** · **BLOCKED** · **NOT STARTED**

> `DONE` means implemented and verified. `IN PROGRESS` may mean the code is
> complete enough for review but the current environment has not executed the
> required build/integration/live-provider proof yet.

---

## Verification state

The last fully executed suite remains the 2026-09-07 baseline:

| Check | Last fully verified result |
|---|---|
| `npm ci` on a clean clone | **PASS** |
| `npm run lint` | **PASS** |
| `npm run typecheck` | **PASS** |
| `npm test` (unit + integration) | **PASS** — 681 passed, 0 skipped |
| `npm run build` | **PASS** |
| `npx playwright test` (production build) | **PASS** — 104 passed |
| `prisma migrate deploy` | **PASS** — 18 migrations, no drift |
| Live production deployment | **PASS** — deployed 2026-09-07, migrations applied |
| Production browser smoke tests | **BLOCKED** — this environment cannot reach the production host |

### 2026-09-09 verification boundary

The branch has moved beyond that verified baseline. GitHub Actions is currently
failing before useful job logs are produced. The same short failure happened on
commit `38038d5`, before the 2026-09-09 completion changes, and attempting to
retrieve the job log returns no available blob. Therefore the newer changes
below are **not** marked DONE solely because they were committed. They require a
working runner or equivalent clean-clone execution before promotion to DONE.

CI still declares the correct release gate: database validate/deploy/status,
seed, lint, typecheck, complete unit/integration suite with
`REQUIRE_DATABASE=1`, production build, and Playwright E2E.

---

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
| CI workflow definition | **DONE** | Full Postgres + build + E2E gate is defined; current runner execution is blocked before useful logs |

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
| **Image ZIP import** | **IN PROGRESS** | Implemented 2026-09-09: read-only preview, `item_id` filename mapping, SHA-256 preview binding, tenant-safe assignment through the existing media pipeline, ZIP64/encryption/traversal/bomb limits, CRC validation and unit coverage. Awaiting working CI/E2E proof before DONE. |

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
| True autosave | **DONE** | Draft-only, debounce, visible dirty/saving/saved/failed states, retry and serialized writes |
| Undo / redo | **DONE** | Theme, layout, typography, photography, density and display history through the serialized draft queue |

## API and integration

| Area | Status | Notes |
|---|---|---|
| `/api/v1` read surface | **DONE** | Authenticated, rate-limited, tenant-scoped |
| API keys | **IN PROGRESS** | Existing hashed keys preserved; 2026-09-09 adds explicit Read-only vs Read+Write issuance and display. Awaiting current CI proof. |
| **Item write API** | **IN PROGRESS** | 2026-09-09 adds scoped `POST`, `PATCH`, `DELETE` item handlers. Requires `write` scope, validates tenant/menu/category boundaries, audits machine actor and price changes, invalidates profile cache, and never auto-publishes. Awaiting current CI/integration proof. |
| Broader API write surface | **NOT STARTED** | Business/menu/category/offer mutation endpoints are not yet exposed; do not describe the API as full CRUD. |

## Operations

| Area | Status | Notes |
|---|---|---|
| Documentation set | **DONE** | This file is the status source of truth |
| **R2 / S3-compatible storage provider** | **IN PROGRESS** | 2026-09-09 implementation provides SigV4 PUT/GET/HEAD/DELETE, public URLs, presigned private GET and write/read/delete probe with no SDK dependency. Configuration validation and mocked unit tests added. Requires live R2 credential round-trip before DONE. |
| **Shared-store rate limiting** | **NOT STARTED** | Current limiter remains in-process; a second replica would have independent buckets |
| **Automated backups** | **NOT STARTED** | Procedure exists; no scheduled/rehearsed automated backup is proven |
| **Error monitoring** | **NOT STARTED** | Structured stdout only; no external error-monitoring service is proven |
| **Live deployment + current smoke tests** | **BLOCKED** | Current environment has no verified browser path to the production host |

---

## 2026-09-09 completion work now on the branch

- Bulk item photography from a ZIP using stable spreadsheet `item_id` filenames.
- Archive safety boundaries: size/entry/uncompressed/ratio ceilings, path traversal
  rejection, unsupported/encrypted/ZIP64 rejection, CRC integrity and existing
  image magic-byte validation.
- Preview fingerprint: confirmation refuses a ZIP whose SHA-256 differs from the
  archive the operator reviewed.
- R2/S3-compatible provider wired into the existing `StorageProvider` seam.
- R2 configuration now requires endpoint, bucket, credentials and public media base.
- API keys can explicitly be Read-only or Read+Write.
- Item create/update/delete API handlers require `write`, preserve tenant scope,
  audit machine changes, keep edits in Draft, and leave the permanent QR untouched.

These statements describe implemented code, not a claim that the current
post-2026-09-07 branch has passed the full release suite while the CI runner is
unavailable.

---

## Next, in order

1. Restore a functioning CI runner and execute the declared clean-clone release gate.
2. Run a real R2 credential round-trip through `probe()` before selecting R2 in production.
3. Run production browser smoke tests across admin, Studio, AR/EN, QR/public menu,
   spreadsheet import and the new image-ZIP workflow.
4. Add and rehearse automated PostgreSQL + object-storage backups/restore.
5. Add shared-store/distributed rate limiting before horizontal scaling.
6. Connect production error monitoring.
7. Expand API write coverage only for resources integrations genuinely need.
