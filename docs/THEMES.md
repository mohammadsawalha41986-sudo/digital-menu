# Themes

A theme is a business's **visual identity**: colours, typography choice, corner radius. It
never changes layout (master spec §21, §26, §27; GOALS I6).

## Two token layers

| Layer | Prefix | Owns | Lives in |
|---|---|---|---|
| System | `--sys-*` | Type scale, spacing rhythm, radius ramps, elevation, motion timings, tap target, content measure | `src/design/tokens.css` |
| Brand | `--brand-*` | One business's colours, font stack choice, radius scale | emitted per profile by `src/design/brand.ts` |

Components read only these. No component hard-codes a business colour, and a test enforces
that across all ten template families.

## How a theme reaches the page

A `BrandTheme` row becomes a flat set of CSS custom properties applied inline to the
profile root:

```
BrandTheme row → brandTokensToStyle() → style={{ '--brand-color-primary': '#2B2118', … }}
```

Inline rather than a generated stylesheet, deliberately: a per-business theme then needs
no build step, no cache key and no class-name collisions across tenants.

## Tokens

```
--brand-color-primary      --brand-font-heading
--brand-color-secondary    --brand-font-body
--brand-color-accent       --brand-radius-sm
--brand-color-background   --brand-radius-md
--brand-color-surface      --brand-radius-lg
--brand-color-text
--brand-color-muted
--brand-color-border
--brand-color-on-primary   ← derived, see below
```

### `--brand-color-on-primary` is computed, not stored

Foreground colour over the brand's primary is derived by WCAG relative luminance — white
or near-black, whichever reads better. Staff choose one colour; legible text over it is
arithmetic, not a second choice they can get wrong.

The same computation backs the QR contrast validator.

### Radius is a scale, not a number

A brand picks `none | sm | md | lg`; the tokens resolve to the system ramp. So "rounded"
means the same thing across templates, and a template can rely on the *relationship*
between `sm`, `md` and `lg` rather than three unrelated values.

### Fonts are keys, not stacks

`fontHeading` and `fontBody` store keys (`system-serif`, `system-sans`, `system-mono`)
resolved to stacks in `brand.ts`. Licensed Arabic and Latin display families arrive by
changing that one block — not by editing components.

Arabic gets its own leading via `[lang='ar']` in the system tokens, so Arabic text is set
correctly even when it appears inside an English page as an authored fallback.

## Deriving rather than declaring: the Dark family

`dark` is the one family whose surface is not taken directly from the brand. It uses
`color-mix` to darken the brand's *own text colour*:

```css
--dark-ground: color-mix(in srgb, var(--brand-color-text) 92%, black);
```

So a business with a deep green brand gets a green-black page and one with warm brown gets
a brown-black one — rather than every "dark" business landing on the same near-black. It
still declares no colour of its own, and still passes the no-literals test.

## What changing a theme does not do

Nothing outside presentation. Changing colours, fonts or radius does not change the
business id, the public URL, the QR, menu data, offers, files or analytics history (§150).
The permanence regression test covers this alongside template changes.
