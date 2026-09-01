# RELEASE RECORD

---

## Release

| Field | Value |
|---|---|
| **Production branch** | `claude/goals-ohhrg2` |
| **Production commit** | `e1daada1f99f31197f0f22aaedf77efff39d2f93` |
| **Work branch** | `claude/website-audit-wev2pn` (`fd33103`) |
| **Live URL** | `https://digital-menu-production-2b95.up.railway.app` |
| **Railway project / service** | `scintillating-prosperity` / `digital-menu` |
| **Deployed** | 2026-09-01 |

Two deployments in this release window:

1. **`345e276`** — 2026-09-01 05:02 UTC. The PR #2 merge. Build **SUCCESS**,
   all five migrations applied, healthcheck **passed**.
2. **`0c6e8c9`** — 05:19 UTC. Security-header fix. Build SUCCESS, no pending
   migrations, healthcheck passed.
3. **`e1daada`** — 05:34 UTC. The template-preview fix (see below).

---

## Migrations

Applied to the production database at 05:03:53 UTC, by the release entrypoint,
in the container about to serve. A failed migration aborts the release and the
previous deployment keeps serving.

```
Applying migration `20260831210000_menu_version_snapshots`
Applying migration `20260831220000_client_review`
Applying migration `20260831230000_nutrition_fields`
Applying migration `20260831235000_media_focal_and_derivatives`
Applying migration `20260901000000_menu_scheduling`
All migrations have been successfully applied.
```

**Status: 16 of 16 applied. No drift.** All five are additive — no `DROP`, no
rename, no type change, no data rewrite.

Locally reproduced against a clean PostgreSQL 16 before the fact:
`prisma migrate status` → *Database schema is up to date!*

---

## Backup

**BLOCKED — PRODUCTION BACKUP ACCESS.**

The Railway MCP surface available to this session exposes no backup or
snapshot operation for the Postgres service, and the database is not reachable
from this session's network. No backup was taken by me, and none is claimed.

Mitigating facts, not substitutes: every migration is additive, the release
entrypoint aborts on migration failure leaving the prior deployment serving,
and the migrations were rehearsed end-to-end against a clean PostgreSQL 16
before deployment.

**Recommended before the next schema change:** enable Railway's Postgres
backups, or take a manual `pg_dump`.

---

## Verification

### Local, against a real PostgreSQL 16

Installed and run in this session — the 167 previously-blocked tests are no
longer blocked.

| Check | Result |
|---|---|
| `npm ci` from a clean clone, no `.env` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run typecheck` | **PASS** |
| `prisma migrate deploy` + `migrate status` | **PASS** — schema up to date |
| `npm run db:seed` | **PASS** — 8 demo profiles |
| `npm test` | **PASS — 627 passed, 0 skipped** (50 files) |
| `npx playwright test` | **PASS — 76 passed** |
| `npm run build` | **PASS** |
| Served build, headers probed | **PASS** |

Repeated **9 consecutive** full runs at 624/624 to check for flakiness.

`REQUIRE_DATABASE=1` now makes an unreachable database fail rather than skip;
CI sets it for both jobs.

### Production, via Railway telemetry

| Check | Result |
|---|---|
| Build | **SUCCESS** |
| Migrations | **SUCCESS** — all applied |
| Bootstrap | staff account present, password unchanged |
| Server start | `0.0.0.0:8080`, Next.js 16.3.3 |
| Healthcheck `/api/health` | **SUCCEEDED** on every deployment |
| Production HTTP (last hour) | **161 requests — 158×2xx, 3×3xx, 0×4xx, 0×5xx** |
| Application error logs | none |
| Routes built | 50, including every new one |

---

## Defects found and fixed

### 1. The template preview was blank in production — reported by the owner

Two independent causes, and both render the same way: an empty frame, with
nothing thrown, no error logged, and no test failing. The page looks fine until
a person looks at it.

**Cause A — the security headers.** `frame-ancestors 'none'` and
`X-Frame-Options: DENY` blocked the admin from framing its own pages. Fixed to
same-origin in `0c6e8c9`; cross-origin framing, the actual clickjacking threat,
stays blocked.

**Cause B — the preview framed the wrong route.** Admin → Template framed
`/m/{publicId}`, the *public* route, which serves only an ACTIVE business with
a published menu. For a business still being built — which is exactly when
someone chooses a template — all three frames were a **404**. The Menu Studio's
live preview had the same defect for an unpublished menu.

Both now frame `/admin/preview/{businessId}`, which the guided builder already
used: the same renderer, the same read model, the same templates and brand
tokens, able to see drafts, tenant-guarded, recording no analytics. The
studio's "open" link still points at the real public URL.

That route also answered an unauthenticated request with a **500**, which
inside an iframe is a blank frame with no explanation. It redirects to login
now.

Verified in a real browser: `e2e/template-preview.spec.ts` asserts what is
*inside* the frames — all ten template families in Arabic and English, real
viewports at 390, 768 and 1200, a draft business previewing, template
switching changing the design but not the dishes, and a signed-out request
redirected rather than served.

### 2. The login limiter counted successes

Found while running the E2E suite. The per-client window is shared by everyone
behind one address, and successful sign-ins counted against it — so
twenty-five ordinary sign-ins would lock a restaurant group out of its own
admin. A correct password now clears both windows: these limits count
failures, which is what guessing is made of. Runs of failures are still
stopped, per account and per client.

### 3. Found by live-grade testing

Running the E2E suite against a real database — possible for the first time in
this environment — found a defect shipped in deployment 1:

**`frame-ancestors 'none'` / `X-Frame-Options: DENY` blocked the admin's own
same-origin preview iframes.** The Menu Studio live preview, the template
picker, and both guided-builder preview panes were blank in production.
Nothing errored; the panes were simply empty.

Fixed to same-origin in deployment 2. Cross-origin framing — the actual
clickjacking threat — stays blocked. `e2e/security-headers.spec.ts` now asserts
the headers are present, that framing is *restricted* rather than *forbidden*,
that the CSP names no external origin, and that a profile genuinely renders
inside a same-origin frame.

Two test defects of my own were found alongside it: an analytics poll that
raced against `offer_view` beacons, and a PDF CMap scanner that read `bfchar`
but not `bfrange`.

---

## Live smoke tests — NOT PERFORMED

**BLOCKED — EGRESS POLICY.**

This session's egress proxy denies the production domain:

```
connect_rejected — gateway answered 403 to CONNECT (policy denial)
host: digital-menu-production-2b95.up.railway.app:443
```

The denial is a standing organisation network policy, not a transient failure;
general outbound HTTP is restricted to an allowlist that does not include
`railway.app`.

**Therefore the following remain untested against production**, and this
release is *not* described as production-verified:

login and session · staff isolation across businesses · public profile
rendering · Arabic RTL and English LTR in a real browser · mobile widths ·
template differences · offer placement · working hours · Excel import and
round trip · menu rollback · QR permanence · PDF download · client approval ·
media upload · analytics events · performance.

Every one of these is covered by the local suites against a real database and
a real browser. That is strong evidence and it is not the same thing as live
verification.

**The 22 live smoke tests are specified in `docs/DEPLOYMENT-READINESS.md` §4**
and can be run by anyone with ordinary network access to the site.

---

## Known limitations

Carried forward, all non-blocking for commercial use:

| Item | Spec | Status |
|---|---|---|
| Server-side PDF generation | §59, §60 | POST-LAUNCH — the printable page is a complete path; browser rendering is what makes Arabic correct |
| Three brand directions | §27 | POST-LAUNCH |
| Template comparison side by side | §37 | POST-LAUNCH |
| Seasonal brand-preset scheduling | §70 | POST-LAUNCH |
| Autosave and undo | §23, §24 | POST-LAUNCH |
| Product variants (sizes) | §55 | POST-LAUNCH |
| Link health checking | §65 | POST-LAUNCH — links honestly reported as *unchecked* |
| Command palette | §92 | POST-LAUNCH |
| Bulk operations across businesses | §145 | POST-LAUNCH |
| Cloudflare R2 storage | §125 | POST-LAUNCH — local volume is adequate for one instance |
| API write endpoints | §149 | POST-LAUNCH — read surface complete |
| Image ZIP import | §71 | POST-LAUNCH — SSRF surface, needs an allowlist |
| Visual regression screenshots | §133 | POST-LAUNCH — overflow checked at five widths |
| Demo photography | §144 | POST-LAUNCH — commercial, not technical |

### Test isolation note

Running the unit/integration suite concurrently with the E2E suite against the
same database produced one transient failure in a single observed run, not
reproducible across nine subsequent runs. CI runs the suites sequentially. The
likely interference is `tests/integration/staff-management.test.ts`, which
briefly deactivates other super admins to assert the last-super-admin guard.
Recorded rather than dismissed.
