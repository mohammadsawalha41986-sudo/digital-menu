# Menu Studio

The Menu Studio is the module a restaurant uses to *build* its menu, not to file a PDF.
It sits on the content model that already exists and adds four things the platform did
not have: a design workspace, a data-driven theme layer, a brand identity derived from
the restaurant's own logo, and richer menu structure (subcategories, modifiers, cost).

## What the spec asks for, and where it lives

| Spec | State | Where |
|---|---|---|
| Menu projects, categories, items, pricing | **Built** | `Menu`, `MenuCategory`, `MenuItem` |
| Draft → publish, versions, archive | **Built** | `MenuVersion`, `publishMenu` |
| Excel/CSV import: upload → map → preview → validate → import | **Built** | `src/server/import/` |
| Excel template download, export, round trip | **Built** | `src/server/import/export.ts` |
| Arabic/English per field, RTL/LTR, no machine translation | **Built** | `src/i18n/` |
| Item photography, media library, safe deletion | **Built** | `src/server/media/` |
| Digital menu at a permanent URL, mobile-first | **Built** | `/m/{publicId}` |
| QR generation, artwork, readability | **Built** | `src/server/qr/` |
| Ten visual template families | **Built** | `src/templates/registry.ts` |
| Subcategories | **New** | `MenuCategory.parentId` |
| Modifiers and add-ons | **New** | `ModifierGroup`, `ModifierOption` |
| Food cost and margin | **New** | `MenuItem.costMinor` — computed only where cost exists |
| Theme as configuration, not per-design code | **New** | `src/menu-studio/themes/` |
| Typography engine (heading/body/price/accent) | **New** | `src/menu-studio/typography.ts` |
| Logo → colour extraction → brand palette | **New** | `src/server/brand/identity.ts` |
| Brand presets shared across menus | **New** | `BrandPreset` |
| Studio workspace: structure / live preview / design | **New** | `/admin/businesses/[id]/studio` |
| Device preview (desktop, tablet, mobile, print) | **New** | Studio preview frame |
| Bulk edit | **New** | Studio item table |
| Marketing engine, campaigns, performance (§38) | **Not applicable here** | No marketing engine exists in this repository. The menu data is exported and reachable through `/api/v1`; wiring it to a campaign system is that system's work, and inventing metrics would violate GOALS I9. |
| Server-side PDF generation (§25) | **Deferred, stated** | A print stylesheet and a print preview exist; a headless renderer in the runtime image is a separate decision. Not claimed as done. |

## Decisions

**Template ≠ theme ≠ brand.** Three layers, already half-present, now complete:

- **Template** (code): composition — what markup exists and how it is arranged.
- **Theme** (configuration): presentation — typography roles, spacing, image treatment,
  borders, decoration, category/item/price styling.
- **Brand** (data, per business): the restaurant's own palette and fonts.

Changing any one of them changes nothing about the other two, and none of them touch
menu *data*. That is what makes "switch the theme" safe: items, categories, prices,
descriptions, images and modifiers are untouched, because the theme has no access to them.

**Themes are configuration, not ten more components.** A `MenuTheme` is a plain object.
The renderer consumes it. Adding a theme is adding a file of values, not a template.

**Item flags live in `tags`, not new columns.** `popular`, `new`, `vegetarian`, `spicy`
and the rest are a controlled vocabulary over the existing `tags String[]`, which already
imports, exports and round-trips. `featured` stays its own column because sorting depends
on it. New columns for each flag would have bought nothing and broken the round trip.

**Extraction is measured, never invented.** Colours come from decoding the actual logo
and quantising its pixels. Every derived value records whether it was extracted or set by
hand, and the operator can override all of it. Where a value cannot be determined the
platform says so rather than guessing — the same rule as calories and translations
(GOALS I9).

**No AI is wired to this.** §9 and §37 are conditional on an AI engine being available;
none is configured in this repository. The recommendation engine here is deterministic
and inspectable: contrast ratios, hue relationships and script coverage decide the
suggestion. It is labelled as a suggestion and every field it fills stays editable. When
an AI service is configured it can replace the recommender behind the same interface.

## Where the studio lives

| Screen | Does |
|---|---|
| `/admin/businesses/{id}/studio` | Brand identity, modifier groups, menu projects |
| `/admin/businesses/{id}/studio/{menuId}` | Structure · live preview · design, then bulk edit |
| `/admin/businesses/{id}/menus` | Menu content: categories, items, publishing |
| `/admin/businesses/{id}/data` | Excel/CSV import and export |
| `/m/{publicId}` | What a customer gets |

## §41 — the QA list, and what actually passes

Each line is checked by a test, and the test is named. Nothing is ticked on the
strength of having written the code.

| Check | State | Evidence |
|---|---|---|
| Logo upload | **Works** | `tests/integration/media.test.ts` |
| Logo identity extraction | **Works** | `tests/unit/brand-identity.test.ts` — real images decoded |
| Brand palette | **Works** | same, including the 7:1 / 4.5:1 contrast guarantee |
| Theme switching | **Works** | `tests/integration/menu-studio.test.ts`, `e2e/menu-studio.spec.ts` |
| Typography switching | **Works** | `menu-studio.test.ts`; roles resolve to real stacks |
| Arabic / English / RTL | **Works** | `e2e/smoke.spec.ts`, `e2e/profile-content.spec.ts` |
| Menu items, categories, subcategories | **Works** | `menu-studio.test.ts`, `import-export.test.ts` |
| Images | **Works** | `media.test.ts` |
| Live preview | **Works** | `e2e/menu-studio.spec.ts` — a real iframe of the public page |
| Visual Theme Library | **Works** | Real lazy-loaded menu previews; selecting a theme/variant previews without a database write |
| Draft autosave | **Works** | 900 ms debounce, explicit status and retry; requests are serialized so an older save cannot overwrite a newer edit |
| Design undo / redo | **Works** | Last 20 choices across theme, layout, typography, photography, density and display; travelling history uses the same draft autosave queue |
| Mobile preview | **Works** | same; the whole E2E suite runs at Pixel 7 width |
| Import Excel and CSV, mapping, validation | **Works** | `import-export.test.ts` |
| Export Excel and CSV | **Works** | same |
| Import/export round trip | **Works** | same — including subcategory and cost |
| Draft / publish / versioning | **Works** | `public-profile.test.ts`, `full-journey.spec.ts` |
| Multiple themes | **Works** | `menu-themes.test.ts` proves they are structurally distinct |
| Brand preset | **Works** | `brand-identity.test.ts`, `menu-studio.test.ts` |
| No client data leakage | **Works** | `tenant-isolation.test.ts`, plus scoped tests in `menu-studio.test.ts` |
| No fake functionality | **Works** | margins, calories and translations are absent when unknown |
| No hard-coded restaurant identity | **Works** | a test asserts no theme contains a colour at all |
| PDF export | **Not implemented** | see below |

### What is deliberately not claimed

**Server-side PDF export (§25).** The print path exists — a print stylesheet
that drops photography and keeps items off page breaks, and a print preview in
the studio — so a menu can be printed to PDF from a browser today. Generating
the file on the server needs a headless renderer in the runtime image, which is
a deployment decision with real weight (image size, memory, a browser to patch).
It is not implemented and the interface does not offer a button that pretends
otherwise.

**Drag and drop (§16).** Ordering is by `sort_order` through forms and the
spreadsheet, which works with a keyboard, on a phone, and with no JavaScript.
Drag-and-drop would be an addition to that, never a replacement: the spec asks
for a non-drag alternative, and building the alternative first is the way to be
sure it exists.

**A full page designer (§15).** Page size, margins and columns are theme and
layout properties, not free-form controls. Density, photography treatment,
typography and display toggles are per menu. Arbitrary margins would produce
menus that break at some width, and every layout here is one that holds.

**Agency → client hierarchy (§32).** Isolation is per business, enforced
server-side and tested. Brand presets are per business, so identities cannot
mix. A second tier above business — an agency owning many clients — is not
modelled; memberships would carry it when the product needs it.

**Marketing and profitability integration (§38, §39).** No marketing engine
exists in this repository, and this platform records no orders. Food cost is
stored where a business enters it and margin is computed from it; demand,
campaign performance and "top-performing item" are not shown, because the data
to compute them honestly is not here.

## The guided flow

The detailed screens (businesses → menus → media → template → brand → files)
are still there and unchanged. They are no longer the way in.

`/admin/create` asks for a name. Everything after it happens at
`/admin/build/{id}/{step}` with the live preview beside it:

| Step | Screen | What it writes |
|---|---|---|
| 1 | Name, type, currency | `createBusiness` — slug, public id, locale and brand row derived |
| 2 | Logo | `uploadMedia` → `assignMedia` → `analyseLogo` → `applyBrandPreset` |
| 3 | Style | `updateTemplate` + `updateMenuDesign` |
| 4 | Description, address, contact | `updateBusiness` |
| 5 | Paste, import or build | `createMenu` / `createCategory` / `upsertItem`, or the existing importer |
| 6 | Photos | `uploadMediaAction` / `assignMediaAction` |
| 7 | Builder | `upsertItemAction` / `createCategoryAction` |
| 8 | QR & link | `renderQr` — reads only |
| 9 | Connect | `updateBusiness` |
| 10 | Review & publish | `publishMenu` then `updateBusiness` status |

No new model, no second media path, no second QR, no second template engine.
Every write above is a service that already existed.

### The preview is the page

`/admin/preview/{id}` renders the real profile through the real render path —
same query, same read model, same templates, same brand tokens. It differs from
the public URL in exactly two ways: it can see a draft business and unpublished
menus, and it records no analytics, so an owner checking their own work twenty
times does not appear as twenty customers.

It deliberately sits outside the dashboard route group. Inside it, the preview
inherited the admin sidebar, so every style card showed a picture of the admin
panel wrapped around a sliver of menu.

### What building this exposed

Three defects that had nothing to do with the wizard, found by driving the flow
in a browser and by measuring rather than looking:

- **The admin rendered right-to-left** for anyone whose browser did not ask for
  English, because document direction is negotiated for *visitors* and Arabic is
  the default. The admin is now pinned to LTR; business content inside it still
  carries its own direction per field.
- **A link styled as a primary button was invisible** — `.admin a` and
  `.admin__button` have equal specificity, so accent-coloured text landed on an
  accent-coloured background.
- **Brand colours used as text could be unreadable.** Templates set headings,
  prices and rules in the brand's own primary or accent — fine on a pale page,
  1.65:1 on a dark one. The palette now carries `--brand-color-*-text` variants
  pushed to 4.5:1 against that business's background, keeping the hue, and
  `e2e/design-qa.spec.ts` measures every demo in both languages to keep it that
  way.
