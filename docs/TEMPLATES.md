# Templates

A template controls **structure**. A theme controls **visual identity**. They are separate
systems and must stay separate (master spec §22–§26; GOALS I6).

Recolouring is not a new template. If two families differ only in palette, they are one
family with two themes.

## The ten families

| Key | Structural identity |
|---|---|
| `editorial` | Sticky category index, rule-separated item rows, price as a tabular figure at the inline end. No cards anywhere. |
| `luxury` | Centred ceremonial masthead, **no** category navigation, items as centred stanzas, at most one photograph per category. |
| `minimal` | Renders **no photography at all**. One line per item. No navigation, no disclosure, no motion. |
| `modern` | Sticky identity bar, pill chips, horizontal rows with a square thumbnail, fixed contact dock on phones. |
| `bold` | Full-bleed bands rather than a content column; slab category titles; price set as large as the item name. |
| `dark` | Image mosaic on a ground *derived* from the brand's text colour; captions over a scrim; featured items span two columns. |
| `hospitality` | Service catalogue: address and hours above the list, collapsible groups, duration beside price, a booking action after every group. |
| `cafe` | Compact square tiles two-up, underlined category tabs, size and price stacked. |
| `casual` | Opens with large category picture tiles, then generous photo-left rows. |
| `premium` | Magazine spread: one item per category at feature size with a standfirst, the rest as a quiet two-column index. |

## Why templates are code, not rows

A template is a React component plus a stylesheet. No database row describes that
faithfully, and a "template" table would inevitably become a bag of layout flags — which
is the shape a template system collapses into just before every business starts looking
the same.

A business stores `templateKey` + `variantKey`. Those are validated against the registry
on write and resolved **leniently** on read: an unknown key falls back to the default
family, because a visitor who just scanned a QR must get a branded page rather than a 500.

## Layout variants

Variants are layout choices *within* a family — density, column count, image ratio —
applied through a `data-variant` attribute on the profile root that the family's
stylesheet reads.

If a variant needs different markup, it is a new family instead.

A test asserts every declared variant has a matching `[data-variant]` rule in its
stylesheet, because a variant offered in admin that changes nothing would be a lie.

## Adding a family

1. `src/templates/<key>/<Key>Template.tsx` — the composition. It receives `profile`,
   `locale`, `direction` and `dictionary`. **It never receives a colour.**
2. `src/templates/<key>/<key>.css` — styles using only `--brand-*` and `--sys-*`, and
   logical properties only.
3. Register it in `src/templates/registry.ts` with a description that states what is
   *structurally* different about it.
4. Import the stylesheet in `src/app/globals.css`.

Nothing else changes. That is the extensibility §24 asks for.

Reusable pieces live in `src/templates/shared/`:

- `primitives.tsx` — `Localized`, `Price`, `Calories`, `ProfileImage`, `LocaleSwitcher`,
  `ItemDisclosure`, contact and social builders. These carry **semantics** (language
  tagging, formatting, hidden-when-absent), not appearance.
- `sections.tsx` — offers, downloads and contact renderers that take a class prefix, so a
  family styles them entirely through its own stylesheet.
- `composition.ts` — shared derivations (contact actions, featured items, counts).

## What the tests enforce

Five checks make "template ≠ theme" verifiable rather than aspirational:

1. **No colour literals** in any family stylesheet — no hex, no `rgb()`, no `hsl()`.
2. **Logical properties only** — physical directional properties fail the build, so RTL
   cannot regress in any family.
3. **Distinct motion** — no two families may share a keyframe name; `minimal` must declare
   no motion at all.
4. **Distinct vocabulary** — each family uses its own class prefix, and an E2E test
   asserts the six demo profiles share *zero* class names.
5. **Variants must do something** — see above.

## The §140 design QA

`e2e/design-qa.spec.ts` loads six demo businesses and asserts they differ in class
vocabulary, palette and structural fingerprint (item element, list display mode, column
count, measure, text alignment, presence of navigation); that each renders natively in
both directions with no horizontal overflow at 360/390/430/768/1200px; and that none
renders an empty container.

That last check caught a real defect on its first run — the salon demo rendered an empty
details card because that business has no address and no contact channels.

## Business-type suggestions

`SUGGESTED_TEMPLATES` orders the admin picker by business type (§16). It is a suggestion,
never a restriction: any business may use any template.
