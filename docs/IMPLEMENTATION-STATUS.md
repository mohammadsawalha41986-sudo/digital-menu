# IMPLEMENTATION STATUS

Working checkpoint for the production-completion effort. Read this first when
resuming; do not redo work marked **Done**.

Phase numbers refer to the Autonomous Production Completion Command.
Feature grades (A–E) refer to `docs/AUDIT.md`.

---

## Verification state, right now

| Check | Result |
|---|---|
| `npm ci` on a clean clone | **passes** (was failing — Phase 1) |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | **311 passed**, 124 skipped (was 242 / 124) |
| `npm run build` | succeeds |
| Integration + E2E | **BLOCKED** — no database, no Docker daemon in this environment |
| Live deployment | **Not attempted, by instruction.** Railway access *is* available (corrected below). |

---

## Done

### Phase 1 — Clean clone / installability
`npm ci` failed on a fresh clone because `postinstall` runs `prisma generate`
and the config resolved `DATABASE_URL` eagerly. The URL is now declared only
when set. Build-time and runtime requirements are separated, not weakened:
`prisma migrate` still refuses without it, and `src/lib/env.ts` still requires
it to start. **Verified by deleting `node_modules` and `.env` and running
`npm ci`.**

### Phase 3 (part) — Authentication hardening
- **Rate limiting** — the analytics route held the only limiter in the
  codebase. It is now `src/server/security/rate-limit.ts`, shared by login,
  `/api/v1` and event ingest.
- **Brute-force protection** — login is counted per account (8 / 15 min) and
  per client (25 / 15 min). A correct password clears the account window. Both
  refusals return the same generic message.
- **Security headers** — CSP, `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`, COOP, and HSTS in production only.
  **Verified against a running production build with `curl -D-`.**

### Phase 4 — Real typography *(was the largest gap in the audit)*
Six OFL families now ship self-hosted under `public/fonts` (1.4 MB, per-script
subsets preserved): Cairo, Tajawal, Amiri, El Messiri, Playfair Display, Inter.
The design layer and the studio catalogue were two parallel font systems; they
are now one. Each page preloads only its own business's families, in the script
it is being drawn in.
**Verified in Chromium: all six load and each measures differently from a
deliberately missing font.** `e2e/typography.spec.ts` keeps that check.

### Phase 5 — Working hours *(grade E — dead data)*
Stored and published through the API, never editable and never rendered.
Now end to end: open/closed computed server-side in the business's timezone,
intervals that cross midnight handled as first-class, a native-time-input
editor that works with no JavaScript, and per-family styling in all ten
templates. Demo businesses carry hours shaped like their trades.

### Phase 6 — Offer placement *(grade E — ignored data)*
`HERO` / `BANNER` / `SECTION` were stored and carried into the read model while
every template rendered one identical list. They are now three distinct
designs in each of the ten families. A second `HERO` offer is rehomed rather
than dropped. The seed had no offers at all; it now demonstrates all three.

---

## Remaining, in the order it should be built

### Next — Phase 7/8/9, the publishing spine
- **Phase 7 — menu version snapshots.** `MenuVersion` stores a number and no
  content, so rollback and diff are impossible. This blocks the final
  acceptance journey, whose last two steps are *Rollback Menu → Verify
  Previous Version*.
- **Phase 8 — draft/live separation.**
- **Phase 9 — visual diff.**

### Then
- **Phase 10 — Profile Health** (nothing exists)
- **Phase 3 (rest) — user management**: no UI at all; RBAC is enforced but
  unassignable without database access
- **Phases 39/40 — client preview link and approval**
- **Phases 16–18 — media studio, derivatives, image quality**
- **Phases 19–24 — Excel control centre**: engine is sound, the safety surface
  (change preview, conflict centre, editable mapping, drag-and-drop) is not
- **Phases 29/30 — nutrition and Saudi readiness**
- **Phases 34/35 — PDF generation and QA**
- **Phases 41–43 — agency dashboard, global search, command palette**
- **Phase 44 — QR print kit**
- **Phases 11/12/14/15 — brand directions, brand preview, template comparison
  and recommendation**
- **Phase 65 — the seven missing documents**

### Blocked, and why
| Phase | Blocker |
|---|---|
| 2 — real database testing | No PostgreSQL and no Docker daemon here. 124 tests and all E2E run in CI only. |
| 57 — production storage (R2) | No credentials. The abstraction is in place; `STORAGE_PROVIDER=r2` throws by design rather than pretending. |
| 60–63 — deployment and live verification | **Held at the deployment boundary, by instruction.** Railway access is available — the earlier "no credentials" note was wrong and is corrected here. See *Deployment facts* below. |


---

## Deployment facts, established rather than assumed

An earlier revision of this file said deployment was blocked for want of
credentials. That was wrong, and the correction matters:

| Fact | Value |
|---|---|
| Railway account | authenticated as the repository owner |
| Project | `scintillating-prosperity` |
| Services | `digital-menu`, `Postgres`, `Redis` |
| Live URL | `digital-menu-production-2b95.up.railway.app` (port 8080) |
| **Branch the service deploys** | **`claude/goals-ohhrg2` — not this branch** |
| Persistent volume | mounted at `/app/storage` |
| Last successful deploy | 2026-08-28 |

Two consequences:

1. **This branch is not auto-deployed.** Shipping it would mean either
   repointing the service's source branch or merging into
   `claude/goals-ohhrg2`. Both are decisions about the owner's release
   process, not incidental steps.
2. **This session cannot verify a live deployment.** Its egress proxy refuses
   the `railway.app` domain, so the live smoke tests of Phases 61–63 cannot be
   run from here. Deploying without being able to confirm the result is
   precisely what Phase 64 forbids.

Work therefore stops at the deployment boundary by instruction, with the
migrations and steps documented for whoever runs them.
