# Media

## The pipeline

One path, `storeMedia`, used by both the admin's uploads and the seed. That
matters: demo imagery that skipped it would not exercise the `srcset` the
templates render, which is most of what makes the demos worth looking at.

```
bytes → validate → checksum → dedupe → store → read facts → derivatives → row
```

**Validate.** Declared content type, extension and magic bytes must agree.
Size caps are per type. See `docs/SECURITY.md`.

**Checksum and dedupe.** SHA-256 of the bytes, unique per business. Menus
repeat images far more often than they do not, and re-uploading the same file
should not store it twice. This is also what makes re-seeding idempotent.

**Store.** Key is generated, never derived from the filename:
`businesses/{publicId}/media/{16 hex}{ext}`. Namespaced by the **public** id —
the key is rendered into every public profile, so anything in it is published.

**Read facts.** Width and height come from the bytes via `sharp`, not from the
client. The browser's report is a hint; the quality check depends on the truth.

**Derivatives.** WebP at 320, 640, 1024 and 1600, generated at upload rather
than on first request — an operator waiting a moment beats the first visitor
after a deploy waiting instead. A failure here does not lose the upload: the
original is already stored and the renderer falls back to it.

## Rendering

Every image carries explicit `width`/`height`, a `srcset` of the widths that
were actually generated, `sizes` matching the slot, `loading="lazy"` (eager for
the logo), and `object-position` from the focal point. Layout shift is
prevented by construction, not by hoping.

Focal point is stored **on the medium**, not per placement: a photograph has
one subject, and the dish is in the same place whichever template crops it.
`null` means centre, and is stored as null rather than 0.5 so that an
explicitly-centred image stays distinguishable from an unset one.

`/uploads/[...key]?w=` serves only widths that were generated. An unknown width
falls back to the original rather than erroring — a stale `srcset` should
degrade, not break the page.

## Alt text

**Authored, never generated from a filename**, and authored per language. A
medium carries `altAr` and `altEn` independently.

The demo artwork's alt text describes it as *artwork*:

> `فن تقديمي لـكريمة الكمأة` / `Presentation artwork for Truffle Velouté`

not "photograph of truffle velouté". A screen-reader user told there is a
photograph of a dish, when the image is an abstract composition, has been given
false information — which is worse than being given none.

## Demo artwork

The demo businesses had no images at all. Every template renders image slots,
so what a visitor saw was a menu of empty frames.

A repository cannot carry licensed photography, and inventing photorealistic
dishes would be worse than nothing: a picture of food the kitchen does not
serve is a lie told to a customer. So the demos are **drawn**.

`src/server/media/artwork.ts` composes original artwork from each business's own
brand palette and the geometry of its trade:

| Layer | What it does |
|---|---|
| Ground | A three-stop gradient: primary → accent-shifted → secondary, all deepened |
| Key + fill light | Offset accent lights, lighting the composition from one side |
| Shadow | A corner taken back, so the picture is not evenly lit |
| Motif | Geometry of the trade — plate rims, steam and a cup rim, a scored loaf, stacked bands, grill bars, laminated folds, sweeping strands, scattered rounds |
| Grain | Fractal noise, because gradients band visibly at hero width without it |
| Vignette | A soft edge |

Two decisions are worth recording.

**The middle stop carries the accent, scaled by hue distance.** A two-stop
primary-to-secondary ramp is what makes generated art look generated: most
brands pick both from the same family, so the ramp travels almost no distance
and the result is a flat wash. Moving *through* the accent gives a hue journey,
which is most of what separates a photograph's depth from a gradient's
flatness. But complementary pairs cannot take much of it — mixing a green
primary with an orange accent in RGB passes straight through grey, and the
picture comes out mud. So the mix is scaled by hue distance, and for opposed
hues the accent is carried by the key light instead, where it reads as light
falling on the ground rather than pigment stirred into it.

**Output is deterministic.** A seeded PRNG, not `Math.random`. Re-seeding must
not churn the media table, and `storeMedia` de-duplicates on a checksum of the
bytes — which only works if the same spec produces the same bytes every time.
Re-running the seed adds **0** images.

Logos are drawn as a monogram on the same ground, in a serif stack rather than
a bundled font, so the seed does not depend on what is installed wherever it
runs.

### What is seeded

67 images across 8 demo businesses: a logo and a cover for each, artwork for
every offer, every category and every item. 2.0 MB including all derivatives.
Each business gets its own motif and, where it has several categories, a
different motif per category — a menu should not be four pictures of one idea.

## Media Studio

Upload, replace, delete, preview, crop, focal point, alt text, metadata, usage
tracking, orphan detection, duplicate detection and quality assessment are
implemented (`src/server/media/service.ts`, `derivatives.ts`). Quality is
reported as `GOOD` / `FAIR` / `POOR` from the real dimensions.

## Storage

Behind `StorageProvider` (`src/server/storage/`). The `local` provider writes
to `STORAGE_LOCAL_ROOT` and is served by `/uploads/[...key]`.

**`r2` is not implemented** — it throws rather than silently degrading. This is
the constraint that keeps the application to a single writable node. See
`docs/DEPLOYMENT.md`.
