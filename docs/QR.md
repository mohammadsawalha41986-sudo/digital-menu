# QR codes

The QR is the product's central promise: **the code is permanent, the content is dynamic**
(master spec §10, §11, §166; GOALS I1, I2).

## What a QR encodes

Exactly one of two shapes:

```
{PUBLIC_URL}/m/{publicId}
{PUBLIC_URL}/m/{publicId}/b/{branchKey}
```

`src/server/qr/destination.ts` is the only module that constructs a payload, and it can
produce nothing else. Before rendering, `assertPermanentDestination` rejects:

| Rejected | Why it would break the promise |
|---|---|
| `…/menu.pdf` | The file gets replaced; the code dies with it |
| `…?lang=en` | Language is a visitor choice, not a property of the printed card |
| `…?v=3` | A version in the payload makes the code expire on the next edit |
| `…#offers` | Fragment state is presentation |
| `/ar/m/7XK92A` | A locale segment makes one code per language |
| `/m/7XK92A/template/editorial` | Presentation in the address |
| `http://…` (non-local) | A printed code cannot be upgraded to HTTPS later |

Because the payload derives only from immutable identifiers, regenerating a QR produces a
byte-identical image to the one already printed.

## What changing content does not do

Nothing. That is the point. `tests/integration/qr-permanence.test.ts` changes price,
calories, template family, layout variant, brand colours, business name and branch
details, then asserts the payload **and the rendered SVG** are identical before and after,
while the profile behind it serves the new content.

## Artwork

Four styles, all encoding the identical payload:

| Style | Use |
|---|---|
| `plain` | The bare symbol, for embedding in someone else's artwork |
| `with-logo` | Centre logo on a plate; error correction raised to **H** automatically |
| `with-name` | Symbol plus the business name |
| `with-prompt` | Symbol, name and a scan instruction |

Artwork is presentation; the destination is the contract. Staff can reprint a prettier
card without invalidating anything already on a table.

Caption text is business-authored and goes into SVG markup, so it is escaped.

## Readability validation (§13)

Runs before download links are offered, and reports rather than silently correcting — a
brand palette that will not scan is something staff need to know about, not something to
overrule.

| Check | Threshold | Reason |
|---|---|---|
| Contrast | error below 3:1, warning below 4.5:1 | Scanners threshold the image; below 3:1 cheap phone cameras fail in poor light |
| Inversion | error if modules are lighter than the ground | Finder-pattern detection assumes dark-on-light, whatever the ratio |
| Quiet zone | error below 4 modules | Detection degrades sharply below it |
| Size | warning below 256px | Print quality at normal scanning distance |
| Logo coverage | error above what the EC level recovers (L 2%, M 5%, Q 10%, H 16%) | A logo punches a hole in the symbol |

## Downloads

`/admin/businesses/{id}/qr` renders every style for the business and each branch, shows
the destination, reports validation, and offers SVG and PNG. SVG carries the artwork; PNG
carries the bare symbol, because raster compositing would need a canvas dependency and
print workflows want the vector anyway.

The download route authenticates and resolves a tenant grant like every other admin path,
and honours a `branch` parameter only if that branch belongs to the requesting tenant.

## Operational notes

- **`PUBLIC_URL` is immutable once codes are printed.** It is the origin baked into every
  payload. Changing it invalidates every printed code — treat it as a permanent decision
  per deployment, not a configuration value.
- **A retired branch does not 404.** An unknown branch key degrades to the business
  profile, so a printed branch code keeps working after a rename or closure.
- **An unknown template does not 500.** The registry falls back to the default family, so
  a visitor who scans always gets a branded page.
