# MEDIA STUDIO

Uploading, sizing, cropping and describing images.

Spec sections in brackets.

---

## What happens on upload

1. **Validated** — MIME type, extension and magic bytes must agree `[§128]`.
2. **Deduplicated** — identical bytes for the same tenant reuse the existing
   row. Menus repeat images far more often than they don't.
3. **Measured** — dimensions are read from the bytes, never trusted from the
   browser. The quality assessment depends on the truth.
4. **Derived** — WebP versions at 320, 640, 1024 and 1600 `[§50]`.
5. **Stored** — through the `StorageProvider`, so business logic never learns
   where files live `[§125]`.

A derivative failure never loses the upload: the original is already stored and
the renderer falls back to it.

## Responsive derivatives `[§50, §88]`

Templates emit a `srcset` naming exactly the widths that were written, so a
phone downloads a phone-sized file.

**WebP, not AVIF.** AVIF encodes smaller but costs an order of magnitude more
CPU per image, and this runs inside an admin upload request. WebP is supported
by every browser that will ever scan a QR code, and the saving over the original
JPEG is already large. AVIF becomes worth it behind a queue — that is a change
to make deliberately, not by default.

**Never upscale.** A 400px upload gets one derivative, not four. A 1600px
version of a small image is a bigger file that looks no better.

**SVG is left alone.** It is already resolution-independent; rasterising it is a
downgrade.

### Serving

`/uploads/{key}?w=640` serves a derivative — but **only** for widths actually
generated for that row. The width is checked against stored values and never
passed to an image pipeline, so this cannot be turned into an on-demand resizer,
which is the usual way an image route becomes a denial-of-service amplifier. An
unknown width falls back to the original, so a stale `srcset` degrades rather
than breaking the page.

### Catching up on older uploads

"Generate smaller versions" processes twenty at a time and reports how many
remain. Bounded because it runs in a request: a business with a thousand images
must not turn one click into a multi-minute transaction.

## Focal points `[§47, §48]`

Click the image where the subject is. Templates crop *around* that point, which
is how one upload serves a 1:1 tile, a 4:5 card and a 16:9 hero without the
operator uploading three copies.

Implemented as CSS `object-position` rather than by generating cropped files: a
changed focal point takes effect immediately and costs no storage.

Stored on the **medium**, not per placement — a photograph has one subject, and
the dish is in the same place whichever template crops it.

`null` means centre. It is stored as null rather than `0.5` so an image someone
deliberately centred stays distinguishable from one nobody has looked at.

The editor shows all three crops using the same `object-position` the templates
apply, because the value of setting a focal point is seeing what it saves.

## Quality assessment `[§49]`

| Level | When |
|---|---|
| `GOOD` | Wide enough for every size the templates use |
| `FAIR` | Under 1000px — fine in a list, soft as a full-width image |
| `POOR` | Under 600px — visibly soft anywhere large |

An extreme aspect ratio is flagged with the actual remedy: set a focal point.

A very large file is reported as costing **storage, not speed** — derivatives
mean the visitor never downloads it — and does not lower the grade.

Assessed from stored dimensions rather than by re-reading files, so a library of
two hundred images does not decode two hundred files to render a page.

## Alt text `[§101]`

Authored per language, never generated from a filename. A filename is not a
description, and a screen reader announcing `IMG_4032` is worse than silence.

Profile Health flags images that have none.

## What is not implemented

- **Crop and rotate as destructive edits.** Focal points solve the framing
  problem without modifying originals, which `[§96]` requires be preserved. A
  true crop tool would need an editing surface and a derivative-invalidation
  path.
- **Image ZIP import** `[§71]`. `image_url` is validated but never fetched:
  fetching arbitrary URLs server-side is an SSRF surface needing an allowlist
  and a fetch budget.
