# DEPLOYMENT READINESS

Prepared for whoever runs the deployment. Nothing in this document claims the
branch is live or production-verified, because it is neither.

Branch: `claude/website-audit-wev2pn`

---

## 1. Verification state

Everything below was run, not assumed.

| Check | Command | Result |
|---|---|---|
| Clean-clone install | `rm -rf node_modules && npm ci` (no `.env`) | **passes** |
| Schema | `npx prisma validate` | valid |
| Lint | `npm run lint` | clean |
| Types | `npm run typecheck` | clean |
| Unit + integration | `npm test` | **457 passed, 167 skipped** |
| Production build | `npm run build` | succeeds |
| Serves | `npm start` + probes | `/` 200, `/robots.txt` 200, fonts 200 |
| Security headers | `curl -D-` against the running build | CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy all present |

At the start of this work the same suite was **242 passed, 124 skipped**, and
`npm ci` failed outright on a clean clone.

### The 167 skipped tests

They are the integration suites and they are **BLOCKED, not passing**. Each
guards on a reachable `DATABASE_URL`. This environment has the `docker` client
but no daemon and no PostgreSQL, so no database can be started. They run in CI,
which provisions `postgres:16-alpine`.

**This is the single largest gap in the verification above**, and it is stated
plainly rather than papered over: the tenant-isolation, QR-permanence,
menu-version, client-review and staff-management suites have not been executed
against a real database from this session.

### Two probes that look like failures and are not

- `/api/health` returns **503** here because there is no database. That is the
  health check working.
- `/robots.txt` returned **500** until a real `AUTH_SECRET` was supplied. That
  is the environment layer refusing the development placeholder in production
  mode — by design.

---

## 2. Migrations that will run

Five, all additive. In order:

| Migration | Changes | Risk |
|---|---|---|
| `20260831210000_menu_version_snapshots` | Adds `snapshot`, `summary`, `restoredFromVersion` to `menu_versions` | **None.** All nullable. Existing versions keep their rows and are reported as un-restorable rather than back-filled. |
| `20260831220000_client_review` | Creates `ReviewState` enum, `preview_links`, `change_requests` | **None.** New tables only. |
| `20260831230000_nutrition_fields` | Adds nine nullable columns plus `highSalt BOOLEAN NOT NULL DEFAULT false` to `menu_items` | **Low.** A defaulted `NOT NULL` add rewrites no rows on PostgreSQL 11+. |
| `20260831235000_media_focal_and_derivatives` | Adds `focalX`, `focalY`, `derivativeWidths` to `media` | **None.** All nullable / defaulted empty. |
| `20260901000000_menu_scheduling` | Adds `startsAt`, `endsAt`, `dailyFrom`, `dailyTo`, `timezone` to `menus` | **None.** All nullable; a menu with no window is served exactly as before. |

**No migration drops a column, renames one, changes a type, or alters existing
data.** There is no destructive statement in any of the five.

### Rollback

Migrations are forward-only. Reverting the application code without reverting
the schema is safe — every added column is nullable or defaulted, and no
existing code path reads them. Reverting the *schema* would need hand-written
`DROP COLUMN` statements, and is not necessary to roll back the release.

### One thing to check before running them

`prisma migrate deploy` will apply all five in one go. The production database
currently serves branch `claude/goals-ohhrg2`. If that branch has migrations
this branch does not, the two histories have diverged and `migrate deploy` will
refuse — **verify with `npx prisma migrate status` against production first.**

---

## 3. Deployment steps

The Railway service `digital-menu` in project `scintillating-prosperity`
currently deploys **`claude/goals-ohhrg2`**, not this branch. Shipping this work
therefore requires a deliberate choice:

**Either** merge `claude/website-audit-wev2pn` into `claude/goals-ohhrg2` and
let the existing pipeline deploy it, **or** repoint the service's source branch.

Then, in order:

1. **Back up the database.** Five migrations, forward-only, on live client data.
2. `npx prisma migrate status` against production — confirm no divergence.
3. Deploy. The image build needs no secrets; `prisma generate` no longer
   requires `DATABASE_URL`.
4. `npx prisma migrate deploy`.
5. Confirm `/api/health` reports `application`, `database` and `storage` up.
6. Run the smoke tests in §4.

### Environment

No new required variables. The service already carries every key
`src/lib/env.ts` demands.

Two notes:

- **`PUBLIC_URL` is baked into every QR payload** and must not change. The print
  kit and the printable menu both read it.
- Uploaded media and their new derivatives live under the existing
  `/app/storage` volume. Derivatives roughly **double** stored image bytes —
  four WebP versions per image, each far smaller than the original. Check
  headroom on the volume before running the "Generate smaller versions"
  backfill.

---

## 4. Live smoke tests required

These have **not** been performed. This session's egress proxy refuses the
`railway.app` domain, so the live URL is unreachable from here.

Nothing may be described as production-ready until these pass.

### Foundation
1. `/api/health` returns 200 with all three checks `up`.
2. `/m/DEM001` renders in Arabic, right-to-left.
3. `/m/DEM001?lang=en` renders in English, left-to-right.
4. Response headers carry the CSP and HSTS.

### The permanence invariant — the one that matters most
5. Open a QR for a real business. Note the image.
6. Change an item's price in the admin. Open the **same** QR. New price shows.
7. Change the template. Same QR. New design, same content.
8. Replace the PDF. Same QR. New file.
9. Confirm the QR image and the public URL are byte-identical throughout.

### New in this release
10. **Fonts** — a profile's headings render in Amiri/Cairo, not a system serif.
    Check DevTools: `/fonts/*.woff2` returns 200 and `document.fonts` reports
    the families loaded.
11. **Opening hours** — a business with hours shows an open/closed badge, and it
    is correct for the business's timezone rather than the viewer's.
12. **Offer placement** — a HERO offer leads the page, a BANNER offer is a
    strip, a SECTION offer sits in the list, and they look different.
13. **Version rollback** — publish, change a price, publish again, restore the
    earlier version, confirm the visitor sees the earlier price through the same
    QR.
14. **Profile Health** — the score renders and every Fix link lands on a real
    screen.
15. **Client preview** — issue a link, open it in a private window (no session),
    approve it, confirm the decision appears in the admin. Then revoke a link
    and confirm it 404s.
16. **Media** — upload a photograph, confirm `srcset` is emitted and
    `?w=320` returns a smaller WebP. Set a focal point and confirm the crop
    moves.
17. **Import** — upload a spreadsheet and confirm the preview reports New /
    Updated / Unchanged / Errors with the price moves listed, *before* importing.
18. **Printable menu** — `/m/DEM001/print`, print to PDF, and confirm the
    Arabic is shaped correctly and the text is selectable.
19. **QR kit** — download the zip, open it, confirm every piece carries the same
    address and the posters are A4/A5.
20. **Service mode** — mark an item out of stock and confirm it changes on the
    public profile.
21. **Staff** — create a staff user, grant one business, sign in as them, and
    confirm they cannot reach any other business.

### Then clean up
22. Delete any test business, test staff account and preview links created
    during the smoke tests.

---

## 5. What is still not implemented

Carried forward honestly rather than closed silently:

| Item | Spec | Note |
|---|---|---|
| Server-side PDF generation | §59, §60 | The printable page is a complete path; `docs/PUBLISHING.md` records exactly what generation would additionally need |
| Three brand directions | §27 | One palette is generated, not a choice of three |
| Template comparison side by side | §37 | |
| Seasonal brand-preset scheduling | §70 | Presets exist; an activation window does not |
| Autosave and undo | §23, §24 | |
| Product variants (sizes) | §55 | Modifiers exist; variants do not |
| Link health checking | §65 | Links are honestly reported as *unchecked* |
| Command palette | §92 | |
| Bulk operations across businesses | §145 | |
| Cloudflare R2 storage | §125 | `STORAGE_PROVIDER=r2` throws by design rather than pretending |
| API write endpoints | §149 | Read surface only |
| Image ZIP import | §71 | SSRF surface; needs an allowlist and a fetch budget |
| Visual regression screenshots | §133 | Overflow is checked at five widths; snapshots are not compared |
| Demo photography | §144 | The six demos still carry no imagery |
