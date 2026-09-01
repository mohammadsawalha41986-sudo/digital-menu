# BRAND IDENTITY

How a logo becomes a palette, a type pairing and a theme suggestion — and what
the engine does not claim.

Spec sections in brackets.

---

## Template, theme, brand `[§162, §163; GOALS I6]`

Three separable systems, and collapsing them is a defect:

| Layer | Is | Lives in |
|---|---|---|
| **Template** | Structure — what a hero is, whether categories are tabs or a ruled index | Code (`src/templates/*`) |
| **Theme** | Configuration — density, image treatment, type roles | Data (`MenuDesign`) |
| **Brand** | Identity — colours, fonts, radius | Data (`BrandTheme`), emitted as CSS custom properties |

A template stylesheet contains **no colour of its own**. A test reads every
template's CSS and fails on a hex literal.

## Reading a logo `[§26]`

`src/server/brand/identity.ts` decodes the uploaded logo with `sharp`,
quantises it, and measures:

- dominant, secondary and accent colours
- light or dark tendency
- warm or cool
- saturation
- descriptive mood words the measurements support

Everything is **measured**, and every suggestion is editable. Randomised
typography is how a platform makes every menu look like an accident `[§38]`.

## Contrast `[§28]`

Foregrounds are derived, not chosen: `readableForeground` and `readableOn` walk
a colour toward legibility while preserving hue where possible, and stop rather
than pretending — some hues cannot reach 7:1 without becoming black.

Profile Health reports the resulting ratios, treating body text under 4.5:1 as
an **error** and secondary text under 3:1 as a warning.

## Typography `[§30–§33]`

Fonts are modelled as **roles** — heading, body, price, accent — because that is
how a menu is designed: the price column and the dish name are different jobs.

Six families ship with the platform, all under the SIL Open Font Licence and
self-hosted under `public/fonts` with the licence beside them:

| Family | Scripts | For |
|---|---|---|
| Cairo | Arabic + Latin | Contemporary sans; the default body |
| Tajawal | Arabic + Latin | Geometric; minimal and modern themes |
| Amiri | Arabic + Latin | Naskh serif; heritage and luxury headings |
| El Messiri | Arabic + Latin | Arabic display; bold headings |
| Playfair Display | Latin | Editorial serif, paired with Amiri |
| Inter | Latin | Neutral sans, paired with Cairo |

**Self-hosted, not from a CDN.** The profile's Content-Security-Policy allows no
external origin; a font request to another domain is a request the visitor did
not consent to; and a menu behind a QR code has to render when a CDN is
unreachable.

**Subset per script.** The per-script unicode ranges Google Fonts publishes are
preserved verbatim, so an Arabic reader never downloads Latin glyphs.

**Preloaded selectively** `[§33]`. Each page preloads only the families its own
business chose, in the script it is being drawn in. Everything else loads
lazily.

**Every stack ends in a system fallback**, and every Arabic-capable stack names
an Arabic fallback, so a face that fails to load degrades to real letterforms
rather than tofu. Tests enforce both.

### The `system-*` keys

`system-serif`, `system-sans` and friends are historical names. They are stored
against existing businesses and now resolve to shipped faces. Renaming them
would silently repaint every live menu, so they keep their names and their
meaning changed underneath.

## Brand presets `[§69]`

A business can store several named identities — a palette, a type pairing, a
tone, a recommended theme. Switching preset does not touch content.

**Not implemented:** scheduling a preset `[§70]`. Seasonal branding would need
an activation window on `BrandPreset` and a read-time resolution exactly like
menu scheduling. The model is ready for it; the field is not there.

## What the engine does not claim `[§38]`

The recommender is **deterministic and inspectable**. It reads measured
properties and states its reasoning in words an operator can argue with.

No part of it is described as AI, because no AI service is configured. When one
is, it can replace the function behind the same signature — and the studio will
still treat the result as a suggestion.

## What is not implemented

- **Three brand directions** `[§27]` — Safe, Expressive, Premium. One palette is
  generated; the choice between three is not offered.
- **Live brand preview before committing** `[§12]` — the studio previews a
  business's *current* identity, not a proposed one.
- **Template comparison side by side** `[§37]`.
