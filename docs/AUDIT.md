# REPOSITORY AUDIT — against the Master Upgrade Prompt

Performed against `DIGITAL PROFILE OS — MASTER UPGRADE PROMPT` (176 sections), as
required by **§160**. Every claim below was checked against the code, not against
the documentation. Section references in brackets point at the upgrade prompt.

**Classification (§160):**

| Grade | Meaning |
|---|---|
| **A** | Production ready — works end to end, covered by tests |
| **B** | Partially implemented — exists, needs engineering or UX work |
| **C** | Documented only — specified, not actually implemented |
| **D** | Missing — must be built |
| **E** | Incorrect — exists but conflicts with product principles |

---

## 0. Build health, measured

| Check | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm run build` | succeeds, 39 routes, no build-time secrets |
| `npm test` | **242 passed, 124 skipped** |
| Integration + E2E | **not executable here** — 9 test files skip without a database; no Docker daemon in this environment |

The skipped third of the suite is the part that proves tenant isolation, QR
permanence, import round-trip and public rendering. It runs in CI only. Nothing
below assumes those tests pass locally, because they cannot be run locally.

**One real defect found in the setup path:** `npm ci` fails on a fresh clone
when `.env` does not exist yet — `postinstall` runs `prisma generate`, and
`prisma.config.ts` resolves `env('DATABASE_URL')` eagerly:

```
PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL
```

The README's ordering (`cp .env.example .env` first) hides it. Any other order,
or any CI that installs before exporting env, breaks. Graded **E**.

---

## 1. What is genuinely production ready — grade A

Do not rebuild any of this (§164).

| System | Evidence |
|---|---|
| **Permanent QR / URL invariant** | `tests/integration/qr-permanence.test.ts` mutates price, template, brand and PDF, then asserts the QR payload and SVG are byte-identical. §39, §120, §121 satisfied. |
| **Tenant isolation** | `resolveTenantContext()` turns a requested id into a grant only after a membership or super-admin check; every service calls `requireTenantContext`. `tests/integration/tenant-isolation.test.ts`. §126 satisfied. |
| **RBAC enforcement** | `VIEWER < EDITOR < MANAGER < OWNER` ranks enforced per operation, not per page. |
| **Public profile** | SSR, zero-JS render, Arabic-first, native RTL, ten template families each with layout variants, correct per-element `lang`/`dir`. |
| **Excel/CSV import** | Template download, parse, validate, partial import, duplicate strategy, stable `item_id` round trip, import history, **rollback**, error-XLSX export (§17, §18, §148). |
| **Bulk edit & bulk price ops** | `menu-studio/bulk.ts`, `margin.ts` — multi-select, price adjustment, writes `PriceHistory` (§19, §20). |
| **Modifiers / add-ons** | `ModifierGroup` / `ModifierOption` with min/max select, price deltas, informational only (§56). |
| **Offers** | Bilingual, scheduled, timezone-aware, automatic expiry (§115, §117). |
| **Files** | PDF versioning with only-current-is-public, MIME + extension + magic-byte validation, private files unreachable by URL guessing (§128). |
| **Media library** | Checksum dedup, authored alt text, safe deletion, assignment. |
| **Analytics** | All fourteen event types of §86 present, including per-social-network clicks; no PII, no raw IP; admin ranges (§87). |
| **API v1** | Read surface with pagination, filtering, sorting, consistent error envelopes, scoped bearer keys, `client_id`/`business_id` mapping (§149, §150). |
| **SEO** | Canonical, hreflang, sitemap, robots, per-business indexing switch, OG title/description/image (§119). |
| **Health** | `/api/health` reports app + database + storage (§131). |
| **Deployment** | Multi-stage Docker needing no build secrets, compose, CI, Railway. |
| **Brand extraction** | Logo quantisation, dominant/secondary/accent, tone, contrast auto-correction that preserves hue (§26, partly §28). |
| **Guided build wizard** | Twelve-ish step flow with a live preview that renders through the *real* profile path — no mock renderer (§76, §77 satisfied). |

---

## 2. Partially implemented — grade B

### B1. Typography engine loads no fonts at all — §31, §32, §33
`src/menu-studio/typography.ts` models roles (heading / body / price / accent),
Arabic coverage and a deterministic recommender. But there is **no `@font-face`,
no `next/font`, no `preload`, and no WOFF2 anywhere in the repository.** Every
face resolves to a system stack (`ui-serif`, `Noto Naskh Arabic`, `Segoe UI`…).

Consequence: the ten themes differ in colour, spacing and structure, but all ten
render in the same three or four system faces. This is the single largest threat
to §174 ("if they look like six skins of the same website: FAIL") and to §175.

### B2. Brand palette produces one direction, not three — §27, §28
`buildPalette()` returns a single palette. §27 requires **Safe / Expressive /
Premium** for staff to choose between. Contrast is computed and silently
corrected, but there is no AA/AAA report across heading, body, price, button and
badge as §28 specifies — staff cannot see *why* a colour was adjusted.

### B3. Brand presets exist but cannot be scheduled — §69, §70
`BrandPreset` stores palette, fonts, tone, mood and a recommended theme per key.
There is no `activeFrom`/`activeTo`, so Ramadan / National Day / seasonal
branding (§70) cannot be scheduled.

### B4. Menu versions are numbers, not snapshots — §84, §85, §10
`MenuVersion` holds `version`, `publishedAt`, `publishedBy`, `notes` — **and no
content**. Publishing is atomic (§83 holds), but:
- **Rollback (§85) is impossible** — there is nothing to restore.
- **Version change summary (§84) is impossible** — "v12: 4 prices, 2 images".
- **Visual diff (§10) is impossible** — there is no "before" to compare against.

This is the one gap that blocks the final acceptance journey of §173, whose last
two steps are `Rollback Menu → Verify Previous Version`.

### B5. Audit log is written broadly but barely readable — §146
`recordAudit()` is called from business, brand, offers, media, studio, bulk and
API-key services. It is read in exactly one place: the last **8** rows on the
dashboard. No audit page, no filters, no old-value → new-value display.

### B6. Price history is write-only — §147
`PriceHistory` rows are written by the importer and by bulk edits. **No code
anywhere reads them.** The `38 → 42 SAR` history of §147 is captured and never
shown.

### B7. Import preview does not show what the import will do — §15, §16, §14, §13
The preview shows *valid / invalid* counts and a row sample. It does not show:
- `120 New / 83 Updated / 14 Unchanged / 6 Errors` (§15)
- per-item before → after price diffs (§15)
- an interactive conflict centre (§16) — duplicate handling is a single dropdown
- **an editable column mapping** — the detected mapping is rendered as read-only
  text, and §14 explicitly requires it stay editable
- drag-and-drop upload (§13)

The engine underneath is sound; the safety surface on top of it is not there.

### B8. Template preview: no comparison, no surfaced recommendation — §36, §37, §38
Previews use real content (§36 satisfied). There is no side-by-side **Compare
Templates** view (§37), and the theme recommender's reasoning is computed but
not presented as a ranked "recommended for your brand" list (§38).

### B9. Public menu structure — §58, §111, §112
Multiple published menus render **stacked sequentially** with headings. There is
no visitor-facing menu switcher (§58), no public search (§111) and no filters
(§112). Acceptable for a 30-item café; not for a 400-item restaurant.

### B10. Motion personality is half-built — §99
Keyframes and `prefers-reduced-motion` appear in 5 of 10 template stylesheets
(editorial, luxury, premium, bold, modern). Cafe, casual, dark, minimal and
hospitality have no motion personality.

### B11. Preview devices — §78, §79
Mobile / tablet / desktop exist. Print preview and zoom controls (50/75/100/Fit)
do not.

### B12. Nutrition model is one field deep — §105
`MenuItem` carries `calories`, `allergens[]`, `servingSize`. §105 asks for
caffeine, sodium, salt, protein, carbohydrates, fat, fibre, sugar and a
physical-activity label. See D8.

### B13. Rate limiting covers one route — §126, §149
`/api/events` has an in-process limiter. **`/api/v1` has none. `/admin/login` has
none.** See D12.

---

## 3. Documented only — grade C

| Item | Note |
|---|---|
| Docker Compose | Authored and reviewed, never executed — no Docker daemon in the build environment or in this session. CI exercises only the Postgres service path. |
| Integration + E2E suites | 9 files / 124 tests skip silently without a database. They are real tests; they simply do not run outside CI. |

---

## 4. Missing — grade D

Ordered by commercial impact, not by spec order.

| # | Missing | Spec | Why it matters |
|---|---|---|---|
| D1 | **Webfonts** — ship and load real Arabic + Latin faces | §31–33 | Without this, premium typography is not achievable and §174 is at risk |
| D2 | **Profile Health / quality gate** — nothing exists | §06, §07, §08, §74 | Called "one of the most important upgrades" in the brief |
| D3 | **Dashboard "Needs attention"** — nothing exists | §88, §144 | §143: an operator must not open 500 businesses to know what is wrong |
| D4 | **Media Studio** — crop, focal point, rotate, per-template auto-crop | §46–48 | One image must serve 4:5, 1:1 and 16:9 without three uploads |
| D5 | **Image quality check + derivatives** (thumb/mobile/tablet/desktop, WebP/AVIF) | §49, §50 | `sharp` is already a dependency; images are served exactly as uploaded |
| D6 | **Server-side PDF generation**, bilingual, with PDF QA | §59–62 | Upload path works; generation does not exist |
| D7 | **Client preview link + approval + change requests** | §71–73, §139, §140 | `/admin/preview` is staff-only and tenant-scoped; there is no shareable token URL. This is the managed-service workflow's core |
| D8 | **Nutrition & SFDA-readiness layer** | §05, §105–107 | Saudi market requirement; currently calories + allergens only |
| D9 | **Content-snapshot versioning, rollback, visual diff** | §10, §84, §85 | See B4 — blocks the §173 acceptance journey |
| D10 | **Price-history and audit-log interfaces** | §146, §147 | Data is captured; nobody can see it |
| D11 | **Staff/user management** — invite, assign role, deactivate, change password, reset password | §126 | No UI exists at all. Staff accounts can only be created by the seed. RBAC is enforced but **unassignable** without direct database access |
| D12 | **Security response headers** — CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy | §126 | `next.config.ts` has no `headers()` block; none are set anywhere |
| D13 | **Login brute-force protection** — no lockout, no throttle, no attempt counter | §126 | Unlimited password guesses against `/admin/login` |
| D14 | **API rate limiting** on `/api/v1` | §149 | Explicitly listed in the API requirements |
| D15 | **Global search** and **command palette** | §91, §92 | Agency-scale operator speed |
| D16 | **Quick Update / Emergency mode** and **Service Night mode** | §21, §22 | Named a "major UX differentiator"; §166 targets (disable item < 5s) are unreachable through the current navigation |
| D17 | **Autosave** and **Undo** | §23, §24 | "Never silently lose work" |
| D18 | **Product variants / sizes** (Regular 32 / Large 38) | §55 | Modifiers exist; variants do not |
| D19 | **Menu scheduling** (breakfast/lunch/Ramadan windows with timezone) | §57 | `Menu` has no start/end/timezone fields |
| D20 | **Link health checking** | §65 | External links are stored, never verified |
| D21 | **Duplicate detection** — similar item names; "same image used by 7 items" | §108–110 | `Media.checksum` is stored but never reported on |
| D22 | **QR print pack + QR kit download** (table card, counter card, window sticker, A5/A4, one-click bundle) | §123, §124 | High-value for the managed-service model |
| D23 | **Logo variants** (light/dark/icon) and **cover image** with focal point/overlay | §96, §97 | Templates cannot adapt the logo to a dark hero |
| D24 | **Visual regression screenshots** | §133 | `design-qa.spec.ts` checks overflow at 360/390/430/768/1200 but takes no snapshots |
| D25 | **Demo photography** and a **visual showcase page** | §134–137 | Six demo businesses exist with distinct brands and content, but no imagery — §156 ("photography should communicate") cannot be demonstrated |
| D26 | **Favicon, app icons, web manifest, default OG image** | §118 | `public/` contains only `.gitkeep`; a business without a logo ships no OG image at all |
| D27 | **JSON-LD structured data** (Restaurant / LocalBusiness / Menu) | §119 | The highest-value remaining SEO item for this product category |
| D28 | **S3 / Cloudflare R2 storage provider** | §125 | `STORAGE_PROVIDER=r2` throws by design. Local disk only means uploads do not survive a container replacement without a mounted volume |
| D29 | **API write endpoints** | §149, §150 | Read surface only |
| D30 | **Image ZIP import** | §11 flow | `image_url` is validated, never fetched (SSRF surface, needs an allowlist) |
| D31 | **Bulk business operations** across multiple businesses | §145 | |
| D32 | **Seven missing documents**: `BRAND-IDENTITY.md`, `PUBLISHING.md`, `QUALITY-CHECK.md`, `MEDIA-STUDIO.md`, `CLIENT-APPROVAL.md`, `NUTRITION.md`, `AGENCY-OPERATIONS.md` | §171 | |

---

## 5. Incorrect — grade E

### E1. Working hours are dead data
`Business.workingHours` and `Branch.workingHours` are stored, typed, and
**exposed through `/api/v1`**. But:
- there is no admin editor for them anywhere,
- no template renders them,
- `parseWorkingHours()` in `src/server/business/hours.ts` has **zero callers**,
- `HospitalityTemplate.tsx` documents in a comment that opening hours "lead the
  page" — and then never renders them.

§74 lists Hours in the content checklist and §21 lists "Change opening hours" as
an emergency action. Right now the API publishes a field the product never
maintains. Either wire it end to end or remove it from the API surface.

### E2. Offer placement is a promise the renderer does not keep
`OfferPlacement` (`HERO` / `FEATURED` / `BANNER` / `SECTION`) is stored, selected
in the admin, and carried all the way into `PublicOffer.placement` — and **no
template branches on it**. Every offer renders in one `OffersSection` regardless.
§115 and the per-template "offer presentation" requirement of §35 are unmet while
the data model claims otherwise.

### E3. `npm ci` fails without `.env`
See §0. `postinstall → prisma generate → env('DATABASE_URL')` throws on a clean
clone. Fix by making the datasource URL lazy, or by skipping `generate` when the
variable is absent.

---

## 6. Recommended sequence

Ordered so that each stage leaves the product shippable.

**Stage 1 — Close the honesty gaps (small, high value)**
E1, E2, E3, D26. Nothing in this stage takes long, and each one removes a place
where the product currently claims something it does not do.

**Stage 2 — Safety and trust**
D11 (user management), D12 (security headers), D13 (login throttling), D14 (API
rate limits), D10 (price history + audit UI). Without D11 the platform cannot
onboard a second operator without database access.

**Stage 3 — The publishing spine**
D9 (content snapshots → rollback → visual diff), then D2 (Profile Health) and
B7 (import preview + conflict centre + editable mapping). This unblocks the
§173 acceptance journey end to end.

**Stage 4 — Make it look expensive**
D1 (webfonts) first, then B2 (three brand directions + contrast report), D4/D5
(media studio + derivatives), B10 (motion for the remaining five families),
D23 (logo variants + cover). This is what §174 and §175 actually test.

**Stage 5 — Agency scale**
D3 (attention dashboard), D15 (search + palette), D16 (quick update), D17
(autosave/undo), D31 (bulk business ops).

**Stage 6 — Market fit and the long tail**
D8 (nutrition + SFDA readiness), D6 (PDF generation), D7 (client approval),
D22 (QR print pack), D18/D19 (variants + menu scheduling), D20/D21 (link and
data-quality checks), D27 (JSON-LD), D28 (R2), D24/D25 (visual regression +
demo photography), D32 (documentation).

---

## 7. Answering §175 honestly

> *Can I sell this as a premium managed digital service to a Saudi restaurant tomorrow?*

**Not yet — for three reasons, all fixable.**

1. **Typography.** Everything renders in system fonts (B1). A restaurant owner
   comparing this against a designed brand site will see it immediately.
2. **No quality gate and no rollback.** An operator can publish a broken menu and
   cannot get the previous one back (D2, D9). For a managed service, that is the
   liability.
3. **No client approval path.** The workflow the business model depends on —
   send preview, get approval, publish — stops at a staff-only preview page (D7).

Everything else — the QR invariant, tenant isolation, the import engine, the
template and theme separation, analytics, the API — is real, tested and worth
building on. §00's instruction holds: audit, preserve, upgrade. Do not rebuild.
