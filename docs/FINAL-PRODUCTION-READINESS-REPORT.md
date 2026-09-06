# Final Production Readiness Report

**Date:** 2026-09-06
**Branch:** `claude/digital-menu-production-oih46i`
**Range:** `2dbcaf2` … `84f0f39` — 39 files, +3,391 / −194
**Companion documents:** `PRODUCTION-READINESS-AUDIT.md`, `SECURITY.md`,
`TESTING.md`, `MEDIA.md`, `PRODUCTION-RUNBOOK.md`, `IMPLEMENTATION-STATUS.md`

---

## Executive summary

This pass did not begin by writing features. It began by **running the system**,
which nothing had done: the handover recorded integration and E2E as
`BLOCKED — no database`, and 167 of 624 tests were skipping silently while the
suite reported green. Those 167 were the integration suite — tenant isolation,
media, publishing, the API.

Standing up PostgreSQL, applying all 17 migrations and running everything moved
the entire gate from *unknown* to *passing*, and in doing so surfaced three
defects that were invisible precisely because nothing was exercising them:

1. **The brand colour system had never applied.** Ten template families made
   125 references to custom properties the brand layer does not emit. CSS
   custom properties fail silently, so offer heroes, hours tables and badges
   have been rendering in inherited near-black **on every profile, in
   production**, with nothing reporting a problem.
2. **Every public profile published the internal database id**, in the URL of
   every image, allowing anyone to correlate a tenant across profiles. An
   integration test already asserted this invariant and had been passing only
   because no demo had an image to leak.
3. **Contrast failures throughout**, unmasked once brand tokens resolved:
   1.82:1 white-on-yellow, hero text legible only because the demo artwork
   happened to be dark, and two badges whose broken half depended on the hour
   of day.

Alongside that, the largest product-quality gap: **the demo businesses had no
images at all**, while every template renders image slots. A visitor saw a menu
of empty frames.

All of the above is fixed, each with a regression test verified by reverting
the fix and watching it fail. Three features were added: demo imagery, a
command palette, and Link Health with a tested SSRF guard.

**The one thing that remains outstanding is deployment verification.** A live
production service exists and has never been exercised by these smoke tests,
and this environment cannot reach it. That is why the verdict below is not
"Production Ready".

---

## Before and after

| | Before | After |
|---|---|---|
| Unit + integration | 457 passed, **167 skipped** | **670 passed, 0 skipped** |
| E2E | **BLOCKED** | **90 passed** (production build) |
| Migrations | Never applied anywhere | **17 applied, no drift** |
| Brand tokens resolving | **0 of 125** references | **All** |
| Images across 8 demos | **0** | **67** |
| Public profiles leaking internal ids | **Yes** | No |
| Templates with WCAG AA failures | At least 4 families | **0** |
| Admin contrast coverage | None | Measured on 4 pages + the palette |

---

## Features completed

### Demo imagery (§5, §40)

67 original artworks across 8 businesses — logo, cover, every offer, every
category, every item.

A repository cannot carry licensed photography, and inventing photorealistic
dishes would be *worse* than nothing: a picture of food the kitchen does not
serve is a lie told to a customer. So the demos are **drawn**.
`src/server/media/artwork.ts` composes original work from each business's own
palette and the geometry of its trade — a duotone ground travelling through the
accent, offset key and fill lights, a trade motif, film grain, a vignette. The
alt text, in both languages, calls it artwork rather than describing a
photograph that does not exist.

Two decisions worth recording. The middle gradient stop carries the accent
**scaled by hue distance**: analogous pairs gain a lit ramp, complementary
pairs would pass through grey and come out mud, so for opposed hues the accent
moves into the key light instead. And the output is **deterministic** — a
seeded PRNG, so re-seeding de-duplicates onto existing rows rather than growing
the media table. Re-running the seed adds 0 images.

Everything goes through `storeMedia`, the same path an operator's upload takes,
so the demos exercise the real validation, derivative generation and
de-duplication — 2.0 MB including all derivatives.

### Command palette (§15)

`Ctrl/⌘ K` over businesses, branches, menus, categories, items, offers and
files, plus destination commands. A native `<dialog>`, so focus trapping,
Escape, the top layer and the inertness of the page behind are the platform's
job — those are exactly the details a hand-rolled overlay gets wrong, and gets
wrong for the keyboard users a palette is *for*. Arrows wrap, Home/End jump,
the pointer moves the selection so a click never activates a different row than
the one under the cursor, and a live region announces the result count.

It adds no reach: results come from `globalSearch`, which resolves the visible
business set before it queries anything. Rate-limited, session-gated, and
additive — `/admin/search` remains the same results without JavaScript.

### Link Health (§19) with SSRF protection (§30)

The feature's job is to make the server fetch a URL an operator typed, which is
the textbook shape of SSRF, so the defences *are* the feature:

- Scheme and port **allowlists**, decided from the string before any DNS query.
  An open port list turns a link field into a port scanner.
- The **resolved addresses** are judged, not the hostname, and *every* one must
  pass — a name resolving to both a public address and `127.0.0.1` is an
  attack, not a fallback.
- Loopback, RFC 1918, CGNAT, link-local (**the cloud metadata service**),
  multicast and reserved space refused; for IPv6 also the forms carrying a v4
  address inside — `::ffff:`, NAT64 and 6to4.
- Unparseable addresses **refused, not guessed at**, which closes the octal
  `0177.0.0.1` bypass.
- Redirects followed **by hand**, every hop re-checked.
- Bounded time, hops and bytes; nothing sent; a status class returned, never
  content.

A link with no check reads `Unchecked`, never `Working` — an operator who
trusts a green tick stops looking. WhatsApp and phone are deliberately not
checked, because `wa.me` answers for a number nobody owns.

---

## Features already existing (verified, not rebuilt)

Authentication, RBAC, tenant isolation, business/menu/category/item CRUD,
modifier groups, offers with three placements, working hours, menu scheduling,
service mode, draft/live separation, version snapshots, comparison, rollback,
client preview and approval, Profile Health, the agency dashboard, Excel
import with mapping/conflicts/rollback, export, price history, audit logs,
nutrition fields, ten template families, the brand engine, Arabic/English with
RTL/LTR, self-hosted typography, SEO metadata, the printable menu and PDF path,
QR permanence, the QR print kit, analytics, the media pipeline, the read API,
API keys, global search, guided onboarding, Docker/Railway configuration and CI.

**None of this was rebuilt.** Where it was touched, it was to fix a defect.

---

## Features fixed

| Defect | Why it mattered | Guard |
|---|---|---|
| 125 dead `--brand-*` references across ten families | Brand colours never applied anywhere they were used; silent | `tests/unit/brand-tokens.test.ts` |
| Media URLs carried the internal cuid | Internal id published on every profile; tenant correlation | `tests/integration/media.test.ts` + `public-profile.test.ts` |
| `.admin a` outweighed component classes | The current page's nav link was the one sidebar item you could not read; fixed once by exclusion and recurred | `e2e/admin-contrast.spec.ts` |
| White on yellow at 1.82:1 | WCAG AA failure on the bold offer panel | `e2e/design-qa.spec.ts` |
| Hero text legible only over dark artwork | Would have failed the first time an operator uploaded a pale photograph | `e2e/design-qa.spec.ts` |
| Hours badges broken in the non-rendering state | The bug's existence depended on the time of day | sweep now flips `data-open` |
| Accent text at 4.16–4.49:1 on tinted surfaces | WCAG AA failure | readable variants solved to 5.5:1 |
| Contrast harness read alpha as solid | Produced false failures, hiding real ones | harness composites alpha |

Every one was verified by reverting the fix and confirming the guard fails.

---

## Visual improvements

- Ten template families now actually render in their business's brand.
- The luxury hero is an opaque caption plate beneath a taller picture —
  editorial, and legible regardless of the image.
- Accent fills carry the foreground computed for them.
- The admin's active nav link is readable.
- 67 pieces of brand-coherent artwork, each business with its own identity and
  each category with its own motif.

## Demo businesses

| Public id | Business | Template | Motif |
|---|---|---|---|
| DEM001 | Demo Restaurant (+2 branches) | editorial | dining, produce, grill, coffee |
| DEM002 | Arabic-only café | editorial | coffee |
| DEM003 | Saraya Fine Dining | luxury | dining, produce |
| DEM004 | Curb Roastery | cafe | coffee, produce |
| DEM005 | Station Burger | bold | grill, burger |
| DEM006 | Neighbourhood Bakery | casual | bakery, pastry |
| DEM007 | Nour Salon | hospitality | salon, pastry |
| DRAFT1 | Draft Bakery (deliberately unpublished) | — | bakery |

## Images created

67: 8 logos, 8 covers, 8 offer images, 13 category images, 30 item images.
2.0 MB including every derivative. All original, all deterministic, all through
the production upload pipeline.

## Security improvements

1. Internal database ids no longer published (High — fixed).
2. SSRF defences shipped **with** the feature that needs them (26 unit tests).
3. Amplification bounded: sequential probes, 24-link cap, one run per business
   per minute.
4. DNS rebinding documented as accepted risk with its reasoning, rather than
   left as a surprise.

## Performance improvements

Structural rather than measured: explicit dimensions, `srcset`, `sizes`, lazy
loading and focal-point positioning on every image, so layout shift is
prevented by construction; derivatives generated at upload; the uploads route
serves only pre-generated widths, so it cannot be driven as a resizing
amplifier. **No Lighthouse or field measurement was taken.**

## Accessibility

WCAG 2.2 AA contrast now measured — not eyeballed — across every demo in both
languages, in both open/closed states, plus four admin pages and the palette.
All pass. The palette is fully keyboard operable via a native `<dialog>`.

---

## Test results

| Suite | Result | Detail |
|---|---|---|
| `npm ci` (clean clone) | **PASS** | |
| `npm run lint` | **PASS** | Clean |
| `npm run typecheck` | **PASS** | Clean |
| `npm test` | **PASS** | 670 passed, 0 skipped, 54 files |
| `npm run build` | **PASS** | |
| `npx playwright test` | **PASS** | 90 passed, production build, mobile viewport |
| `prisma migrate deploy` | **PASS** | 17 migrations |
| `prisma migrate status` | **PASS** | No drift |
| Seed | **PASS** | Idempotent; second run adds 0 images |
| Unit: SSRF address policy | **PASS** | 19 cases |
| Unit: link probe vs live server | **PASS** | 7 cases, real loopback server |
| Unit: artwork generator | **PASS** | 14 cases |
| Unit: brand tokens | **PASS** | 3 cases |
| E2E: command palette | **PASS** | 8 cases, keyboard-only |
| E2E: link health | **PASS** | 4 cases |
| E2E: admin contrast | **PASS** | 2 cases |
| E2E: design QA | **PASS** | 10 cases, both open/closed states |
| **Live production smoke tests** | **NOT RUN** | See below |
| **Lighthouse / field performance** | **NOT RUN** | No measurement taken |
| **Link Health against the real internet** | **BLOCKED** | See below |

### On the two that are not PASS

**Live production smoke tests — NOT RUN.** A production service exists
(`digital-menu-production-2b95.up.railway.app`, last deploy SUCCESS
2026-09-06 08:24) but it deploys from branch `claude/goals-ohhrg2`, not this
one. This work has never run there. This sandbox's egress proxy refuses that
host (`CONNECT tunnel failed, response 403`), so the twenty smoke tests in
`docs/PRODUCTION-RUNBOOK.md` could not be executed even against the current
deployment.

**Link Health against the real internet — BLOCKED.** The mechanism was
exercised end to end — policy, fetch, redirect handling, classification,
storage, UI, rate limit — and the demo links were classified `WORKING`. But the
same proxy answers `403` for `instagram.com` and `maps.google.com`, and a 403
is correctly classified as "reachable, refuses anonymous visitors". So those
particular verdicts reflect the sandbox's egress policy, **not** the real
reachability of those addresses. The feature works; those two results prove
nothing about Instagram.

---

## Production verification

**Not performed.** Deployment was deliberately not attempted, for two reasons:

1. Doing so would require **repointing a live production service** from
   `claude/goals-ohhrg2` to this branch — an outward-facing change to a running
   service, on work the user has not yet reviewed.
2. **It could not be verified afterwards.** Egress to the deployment is blocked
   here, so the smoke tests would remain NOT RUN either way. Deploying blind
   and then claiming production readiness is exactly what §42 forbids.

To deploy and verify:

```
Railway → Digital Menu → digital-menu → Settings → Source
  branch: claude/goals-ohhrg2  →  claude/digital-menu-production-oih46i
```

Then work through the twenty checks in `docs/PRODUCTION-RUNBOOK.md`. The
migration added this pass (`link_health`) is purely additive — a new enum, a new
table, one index, one foreign key — with no destructive operation.

---

## Remaining issues

Genuinely outstanding, nothing already done:

| # | Item | Severity | Note |
|---|---|---|---|
| 1 | Production smoke tests never run | **Blocking a "ready" claim** | Needs a deploy this environment cannot verify |
| 2 | Public menu search / filter (§18) | High | Largest visitor-facing gap on a long menu |
| 3 | R2 storage provider (§32) | High for scale | Local disk means one writable node |
| 4 | In-process rate limiting | High for scale | Counters multiply per replica |
| 5 | No automated backups | High | Procedure documented; nothing scheduled |
| 6 | No error monitoring | Medium | Errors reach stdout only |
| 7 | True autosave (§23) | Medium | Explicit save with a pending state exists |
| 8 | Undo / redo (§24) | Medium | Price history and rollback mitigate |
| 9 | API write surface (§35) | Medium | `/api/v1` is read-only |
| 10 | Image ZIP import (§34) | Low | Excel image *mapping* exists |
| 11 | First-class variants (§17) | Low | Modifier groups can express sizes |
| 12 | Analytics insight statements (§27) | Low | Data is captured; the sentence is not written |
| 13 | `next start` vs `output: standalone` | Low | Docker is correct; local `npm start` warns |
| 14 | Dependency advisories | Informational | `mysql2` unreachable (`pg` adapter); awaiting upstream |

---

## Deployment status

**Not deployed.** All work is committed and pushed to
`claude/digital-menu-production-oih46i`. The live service continues to serve
`claude/goals-ohhrg2` and is unaffected by this pass.

---

## Final readiness score

| Dimension | Score | Basis |
|---|---|---|
| Architecture | 9 / 10 | Authorisation in services, tenancy resolved before querying, read model a deliberate projection |
| Backend | 9 / 10 | 670 tests against a real database; additive migrations; clean domain |
| Frontend | 8 / 10 | Ten genuinely distinct families; public menu search missing |
| UX | 8 / 10 | Palette, guided onboarding, actionable health; no undo, no visitor search |
| UI | 9 / 10 | Brand system now actually applies; contrast measured everywhere |
| Creative | 8 / 10 | Every demo has its own identity; artwork is brand art, not photography |
| Accessibility | 9 / 10 | AA measured across both languages and both badge states |
| Security | 8 / 10 | Id leak closed, SSRF defended and tested; rebinding accepted, no monitoring |
| Performance | 7 / 10 | Sound by construction; **never measured** |
| Testing | 9 / 10 | 760 tests, 0 skipped, guards verified by reverting fixes |
| Deployment | 5 / 10 | Config and migrations sound; **never exercised**; no backups |
| Commercial readiness | 8 / 10 | A restaurant owner would recognise this as their menu |

---

## FINAL STATUS

# NOT PRODUCTION READY

Not because the software is bad — the codebase is in materially better shape
than it was, and every automated gate is green with nothing skipped. But
"production ready" is a claim about **production**, and this pass never
deployed and never ran a single smoke test against a live URL. §42 is explicit
that BLOCKED and NOT RUN must not be recorded as PASS, and §50 that a
Production Ready claim requires nothing critical outstanding.

Two things stand in the way, and only two:

1. **Deploy this branch and run the twenty smoke tests** in
   `docs/PRODUCTION-RUNBOOK.md`. This is the whole distance. The code is
   verified; the deployment is not.
2. **Configure backups.** A platform holding client menus and uploaded media
   with no rehearsed restore is one volume failure from losing work no test
   can recover.

With those two done and the smoke tests recorded as PASS, the honest verdict
becomes **PRODUCTION READY WITH MINOR NON-BLOCKING ISSUES** — the remainder of
the list above being feature work and scaling preparation, none of it a defect.
