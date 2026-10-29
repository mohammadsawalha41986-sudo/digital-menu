# Menu Builder v2 — Phase 1 Audit

Author: Claude Opus 4.7
Date: 2026-10-28
Scope: the Master Development Order for Menu Builder 2.0.

This document is the honest baseline the rebuild starts from. It states
what the system actually does today, what it does well, where the
reported defects live, and what the Order's phases can safely assume vs.
what each phase has to build.

## 1. Templates — what exists

Eleven template families register in `src/templates/registry.ts`:

```
editorial · luxury · minimal · modern · bold · dark ·
hospitality · cafe · casual · premium · street-food
```

Each is a React component + stylesheet. `street-food` is the Sabah El
Lail reference app ported in from the uploaded ZIP (hero slides,
customize sheet, cart drawer, reviews, maps, footer). The other ten are
smaller BEM-prefixed compositions.

### Verdict against the Master Order's "12 templates" list

Of the twelve families the Order calls for, five map directly to
existing families, one lives in the ported app, and six are missing:

| Master Order target     | Status                      | Notes                                    |
|-------------------------|-----------------------------|------------------------------------------|
| Modern Food             | missing                     | `modern` is app-like but not food-first  |
| Saudi Heritage          | missing                     | highest priority for the Riyadh market   |
| Premium Grill           | missing                     | closest existing: `dark`                 |
| Street Food             | **shipped** (Sabah port)    | the ZIP app                              |
| Pizza & Italian         | missing                     | editorial is close but not themed        |
| Café & Bakery           | **shipped** (`cafe`)        | may still want a photo-forward variant   |
| Luxury Dining           | **shipped** (`luxury`)      |                                          |
| Asian Fusion            | missing                     |                                          |
| Seafood Fresh           | missing                     |                                          |
| Breakfast & Brunch      | missing                     |                                          |
| Buffet & Hospitality    | partial (`hospitality`)     | needs multi-outlet / catalog variant     |
| Modern Minimal          | **shipped** (`minimal`)     |                                          |

So Phase 2 needs **6 new families** plus one re-pitch of `modern` into
"Modern Food". Each is 2-4 days of focused build + palette + tests.

## 2. The style picker and the "blank cards" symptom

The Order asks us to "fix blank template previews". The relevant code:

- `src/app/admin/(dashboard)/build/[businessId]/[step]/steps/style-step.tsx`
  renders one radio card per template and embeds an `<iframe>` pointed at
  `/admin/preview/{businessId}?template={key}`.
- `src/app/admin/preview/[businessId]/page.tsx` serves the real profile
  through the real render path (same read model, same brand tokens),
  with `?template=` as a response-only override.

So the *mechanism* is correct — each card really is the owner's own
menu in that style. When a card renders blank it is almost always one
of:

1. **CSP + frame-ancestors**: `next.config.ts` sets
   `frame-ancestors 'self'`. Fine for same-origin iframes but a mobile
   browser or a weird CORS edge can intercept it. Verified today: works.
2. **Preview sign-in loop**: an unauthenticated iframe is redirected to
   `/admin/login`, which itself refuses to render in a frame → the slot
   stays blank. If the operator opened the page from a tab whose cookie
   expired, every card goes blank at once.
3. **No menu yet**: a business with zero `MenuCategory` rows previews as
   an empty page. Several templates draw almost nothing then.
4. **iframe geometry**: `width={390} height={620}` on a 3-column grid at
   wide widths crops the preview into a strip; some templates have
   `min-height` taller than that, which looks blank at a glance.

Fix plan (Phase 1 output, Milestone 2):

- Visibly label the iframe state (`empty menu` / `signed-out` / `ready`)
  rather than render nothing. A banner above a dim preview, not a blank
  box.
- Scale the preview with `transform: scale(0.5)` to show the whole page
  thumbnail at the card's size, falling back to the raw iframe for
  templates that break at the scale.
- Add a `/admin/preview/{id}/frame-ok` ping endpoint the picker checks
  before mounting; if 302 to login, swap in a sign-in prompt instead of
  an empty iframe.

Each is small and lands as its own commit.

## 3. Modern template — what it is today

`src/templates/modern/ModernTemplate.tsx` (269 lines) composes:

- compact sticky bar (logo + name + locale switch)
- pill chip category rail
- horizontal row items with square thumbnails
- offers / downloads / hours / contact sections
- a fixed bottom contact dock on phones

It is correct but not photo-led. The Master Order's "Modern" asks for a
full-width hero with carousel + overlay gradients + CTAs, which the
current composition does not have. Phase 3's redesign therefore means
building `src/templates/modern/` v2 (hero carousel, enhanced sticky,
larger photography) while keeping the family key stable so no business
loses its selected style.

## 4. Brand identity engine — what already exists

The platform already models two parallel brand surfaces:

- `BrandTheme` (prisma) — the palette the public profile renders with.
  Eight colours + three typography fields. Owned by `/admin/businesses/
  {id}/brand`.
- `BrandPreset` (prisma) — a derived suggestion from an uploaded logo.
  Stores `extractedColors[]`, computed `colorPrimary` etc., `fromLogo`
  flag and a `manualOverrides[]` list of fields a person touched.

The *data* for the Order's "Automatic Brand Identity Engine" is
largely there. What's missing is the *flow*:

1. A client-side color extraction + a server endpoint that returns a
   suggested palette as a `BrandPreset`.
2. A UI card in the brand editor that reads the preset and offers a
   one-click "apply suggestion" that writes a `BrandTheme`.
3. The WCAG contrast meters the brand editor rebuild from the previous
   phase already added (shipped in commit `fd6abc5`).

Phase 4 is therefore mostly plumbing + a reasonable color-extraction
algorithm, not a schema change.

## 5. Typography

`src/menu-studio/typography.ts` resolves font stacks against a small
built-in list (`system-serif`, `system-sans`, `system-mono`). The last
Sabah port added `next/font/google` loading for Cairo + Tajawal +
Outfit at the layout level. The Order's Phase 5 wants seven more
families selectable per-role (title / hero / category / dish / etc.).

The right shape:

- A `MENU_FONTS` registry (data) listing allowed families with their
  CSS variable + subsets + weights.
- `BrandTheme.fontHeading`/`fontBody` already exist; add `fontDisplay`,
  `fontCategory`, `fontDish`, `fontPrice`, `fontButton` columns in one
  migration, nullable so a theme without them keeps the current look.
- A font-selector UI per role in the brand editor.

The migration is additive and backward-compatible.

## 6. Image presentation

`PublicItem.image` carries url + alt + width/height + srcSet + focal
point already. The ten image-layout modes the Order lists (Phase 6)
are a *template concern*, not a data concern: each new family picks
its layout. No schema work needed. The admin needs an "image focal
point" picker per item for the two layouts that crop square — the
focal point column exists in `Media`, so this is UI only.

## 7. Offers

`PublicOffer` + `OfferPlacement` already model the Order's needs:
title/description/image, original + offer price, discount percent,
start/end dates, placement (HERO / BANNER / SECTION / FEATURED),
featured flag. The admin builds and lists offers today. The Order's
Phase 7 is UX polish (ribbon widget, floating shortcut, horizontal
carousel) + strict timezone-based expiration — all template work.

## 8. Maps

The current contact section renders a `googleMapsUrl` as a link.
Phase 8 wants an embedded interactive map. Three sane paths:

- Google Maps Embed API (free tier, needs API key).
- OpenStreetMap via `<iframe src="https://www.openstreetmap.org/export/
  embed.html?bbox=...">` (free, no key, limited interaction).
- Leaflet with the OSM tile server (interactive, no key, best UX).

Recommend Leaflet. One `<MapBlock>` client component used by every
template that wants an interactive map; the address + googleMapsUrl +
optional lat/lng already exist on `Business`.

## 9. Reviews

No `Review` model today. Phase 9 needs:

- `Review` table (businessId, authorName?, rating 1-5, body, state
  PENDING/APPROVED/REJECTED, replyText?, replyAt?, submittedAt).
- A POST endpoint for public submissions (rate-limited, honeypot,
  optional captcha).
- An admin view to moderate.
- Public rendering only of APPROVED reviews.

Clean, isolated. Migration is new tables only; existing data untouched.

## 10. Sharing

`PublicProfile` has `publicId` + `brand` + metadata. The route is
permanent. OG image generation already exists under
`src/app/m/[publicId]/`. Phase 10 is a `<ShareMenu>` client component
with native share + WhatsApp deep-link + copy-url + QR download. One
file, no backend.

## 11. Excel import

`src/server/admin/import-actions.ts` + the pipeline under `exceljs`
already handle: template download, column detection, preview, errors
by row, add / update modes, tenant isolation. Phase 11 is: raise the
column detection smarts (multiple header languages, synonym matching),
add image-url ingestion, and ship a real downloadable template with
the Order's column layout.

## 12. Builder UX

`src/app/admin/(dashboard)/build/[businessId]/[step]/` is already a
wizard with 10 steps that each render a sub-component. Phase 12's
3-pane layout (nav / editor / preview) is a layout upgrade on top of
this, not a rewrite.

## 13. Compatibility

The schema is additive-friendly. Every migration this program files
should be additive (nullable new columns, new tables) and roll back
cleanly. No field we rename, no column we drop. QR codes resolve
through `Business.publicId` which is immutable by design (schema
comment: "Immutable for the life of the business — changing it would
invalidate printed QR codes").

## 14. Delivery plan

Milestones for this session, each landing as its own commit:

| # | Milestone                               | Cost |
|---|-----------------------------------------|------|
| 1 | This audit                              | now  |
| 2 | Fix blank previews + state labelling    | 1 h  |
| 3 | 3 new templates (Modern Food, Saudi Heritage, Premium Grill) | 4 h |
| 4 | Brand editor: logo-based palette suggestion | 2 h |
| 5 | Typography role-expansion (migration + UI) | 2 h |
| 6 | Open PR + request merge                 | now  |

The rest of the Master Order's eighteen phases is the right backlog,
not this session's work. Scoping it honestly up front is how the
rebuild stays trustworthy — the opposite of what shipping half of
each phase in one go would do.
