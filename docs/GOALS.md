# DIGITAL PROFILE OS — Project Goals

Derived from the Production Build Master Prompt (169 sections). This document is the
contract we build against: it fixes the north star, the invariants that may never be
broken, the stack, and an ordered delivery plan with acceptance criteria.

Section references in brackets — e.g. `[§10, §166]` — point back to the master spec.

---

## 1. North star

Build a **managed-service platform** that turns a business (restaurant, café, bakery,
salon, spa, gym, hotel, retail) into a premium, mobile-first **digital profile** reachable
through a permanent QR code. The company operates the platform; the client receives a
finished service, not a dashboard. `[§00, §04, §165]`

The QR is the doorway. The product is the experience behind it. `[§168]`

## 2. Definition of success

A visitor scans a QR on a phone and, within three seconds, knows who the business is,
what it offers, and what they can do next — in Arabic (RTL) by default, English on
demand. Staff change prices, images, offers, templates or the PDF menu, and **the same
QR keeps working, showing the new content.** `[§31, §11, §151, §159]`

Six demo businesses placed side by side must not look like the same website. `[§140]`

## 3. Non-negotiable invariants

These are hard constraints. A change that violates one is a defect, not a trade-off.

| # | Invariant | Spec |
|---|---|---|
| I1 | The QR encodes a permanent profile URL — never a PDF, image, storage URL or expiring link. | §10, §48 |
| I2 | No content, brand, template, PDF or link change ever regenerates a QR or changes the public URL. | §11, §149, §150, §152 |
| I3 | Arabic is the primary language and is authored first; English is a first-class peer, never a machine afterthought. | §07, §72 |
| I4 | RTL is a native design, not `direction: rtl` on an LTR layout. | §98 |
| I5 | Mobile-first: 360–430px is the primary design target, desktop is derived. | §29, §139 |
| I6 | Template (structure) and Brand Theme (identity) are separate systems. Recoloring is not a new template. | §23, §26 |
| I7 | All content is database-driven. No hardcoded businesses, prices, calories or copy. | §11, §161 |
| I8 | Business data isolation is enforced server-side on every protected request; never trust client-supplied IDs. | §15, §128 |
| I9 | Never fabricate calories, prices, clients, results or translations. Missing data hides its field. | §26 (principles), §37, §72 |
| I10 | Public profiles are browse-only in v1 — no cart, no checkout, no ordering, no visitor login. | §09, §14–17 |
| I11 | Public pages carry the *business's* brand; platform branding is off unless the package enables it. | §146, §147 |
| I12 | The output must not read as AI-generated or as a generic SaaS template. | §27 (principles), §28, §160 |

## 4. Stack decision

The spec is stack-agnostic but requires PostgreSQL, migrations, a versioned REST API,
SSR-quality SEO, and Docker deployability. Assumption, stated explicitly so it can be
overridden before Phase 1 begins:

- **Next.js (App Router) + TypeScript** — one deployable serving the public profiles
  (server-rendered, fast, SEO/OG/hreflang-capable), `/admin`, and `/api/v1`. `[§05, §116, §129]`
- **PostgreSQL + Prisma** — relational schema with real foreign keys and migrations. `[§121, §133]`
- **Tailwind + CSS custom properties** — design tokens per business drive the theme layer. `[§27]`
- **StorageProvider abstraction**, `LocalStorageProvider` first, S3/R2 later. `[§56, §131]`
- **Redis optional** — caching, rate limiting, jobs; never required for local dev. `[§134]`
- **Playwright + Vitest** — E2E for the mandatory §138 journey, unit/integration elsewhere. `[§137]`
- **Docker + docker-compose + .env.example + healthcheck** for Hostinger VPS / Coolify. `[§132, §135, §136]`

## 5. Domain model (target)

```
Business ─┬─ Branch ──── BranchOverride (price / availability / offer)
          ├─ BrandTheme (tokens)   ├─ Template + LayoutVariant
          ├─ Menu ── Category ── Item ── ItemImage
          ├─ Offer (scheduled)
          ├─ PublicFile (PDF, versioned) / ExternalLink
          ├─ QrCode (stable destination)
          └─ AnalyticsEvent
```

Supporting: `users`, `roles`, `media`, `settings`, `api_clients`, `audit_logs`,
`import_batches`, `import_rows`, `menu_versions`, `price_history`. `[§121]`

Public URLs use opaque public IDs (`/m/7XK92A`), never internal numeric IDs. `[§122]`

## 6. Delivery plan

Each phase ends with the listed acceptance criteria demonstrably passing. No phase is
"done" because its code exists — it is done when its criteria are verified.

### Phase 0 — Foundation
Repo scaffold, Docker/compose, `.env.example`, `/health`, CI, Prisma schema + first
migration, seed harness, i18n plumbing (ar default/RTL, en/LTR), token layer.
**Accept:** `docker compose up` yields a running app with a migrated database; `/health`
reports app + DB + storage; both locales render with correct direction.

### Phase 1 — Core domain + public profile v1
Businesses, branches, menus, categories, items, brand themes, one real template family.
Public profile at `/m/{public_id}` with hero, categories, items, item detail, contact.
**Accept:** a seeded business renders end-to-end on 360px with no horizontal overflow;
prices and (when present) calories display; empty sections hide rather than break. `[§119, §120]`

### Phase 2 — Permanent QR
QR generation, preview, PNG/SVG/print, branded artwork variants, contrast + quiet-zone +
minimum-size validation, branch QRs.
**Accept:** change price → template → brand → PDF; the *same* QR image resolves to the
updated profile every time. This is the I1/I2 regression test. `[§12, §13, §85]`

### Phase 3 — Admin dashboard
Auth, RBAC (Super Admin / Staff), business & branch CRUD, menu builder, media library,
brand editor, template picker with mobile/tablet/desktop preview, audit log.
**Accept:** the full §138 journey is completable through the UI by a staff user; a staff
user cannot read or write another business's data. `[§17–21, §123, §148]`

### Phase 4 — Files, PDFs, external links
Upload/replace/delete/preview with MIME + extension + size + content validation, PDF
versioning (only current is public), multiple labelled menu links, public Downloads
section, public/private enforcement.
**Accept:** replacing a PDF leaves the QR and URL untouched; a private file is not
reachable by URL guessing. `[§47–55, §106–108, §153, §154]`

### Phase 5 — Offers engine
Bilingual offers, scheduling with timezone, automatic activation/expiry, hero/banner/
section placements matched to the brand.
**Accept:** an expired offer disappears from the public profile without a deploy. `[§41–43]`

### Phase 6 — Excel/CSV import & export
Template download, upload → preview → validate → column mapping → import → results;
partial import, duplicate strategy, stable `item_id` round-trip, image URL and image-ZIP
import, import history, rollback, price-change audit.
**Accept:** export → edit a price → re-import updates the item, writes price history, and
a rollback restores the prior value. `[§57–79, §124, §126]`

### Phase 7 — Analytics
Privacy-conscious event model (business, branch, profile, type, timestamp, device, locale),
scan/view/category/item/offer/download/contact events, admin ranges (today → all time).
**Accept:** events recorded without PII or raw IP retention; admin ranges aggregate correctly. `[§109–113]`

### Phase 8 — Template & theme system at full strength
Ten template families with genuinely different structure, multiple layout variants each,
per-template motion personalities, mixed item presentations, varied image ratios.
**Accept:** the §140 side-by-side design QA on six demo businesses passes. `[§22–25, §33, §34, §100–102]`

### Phase 9 — API, SEO, hardening, docs
`/api/v1` with pagination/filtering/sorting/consistent errors/auth, AI Marketing OS-ready
endpoints keyed by `client_id`/`business_id`/`branch_id`, SEO + OG + hreflang + sitemap +
per-business indexing switch, caching with correct invalidation, rate limiting, a11y pass,
and the full documentation set.
**Accept:** the §164 QA checklist passes in full. `[§114–118, §127–130, §162]`

## 7. Explicitly out of scope for v1

Ordering, cart, checkout, payments, reservations, booking, loyalty, client-facing
dashboards or accounts, per-business subdomains, custom domains, automatic translation,
AI-generated descriptions or imagery, payment subscriptions. Architecture stays ready for
them; none ships in v1. `[§14–17, §21, §155, §157]`

## 8. Demo data requirement

Six fictional businesses — Saudi restaurant, luxury restaurant, specialty café, burger
restaurant, bakery, luxury salon — each with a distinct brand, palette, typography,
template, layout, imagery and content. The salon must not read as a restaurant: services,
durations, packages, gallery. Demo data is labelled as such and never presented as real
client results. `[§89, §92–94, §141, §145]`

## 9. Open decisions

1. **Stack** — Next.js/Prisma/Postgres is assumed above; confirm or redirect before Phase 0.
2. **Hosting target** — Hostinger VPS + Coolify vs. plain Docker host changes CI/CD shape.
3. **Template family priority** — which of the ten ships first in Phase 1.
4. **Photography source** — licensed assets for the demos must be sourced; the spec bars
   low-quality stock, watermarks and copyright-infringing assets. `[§144]`
5. **Default currency & locales** — SAR default is specified; confirm the initial
   secondary currency list to model. `[§36]`
