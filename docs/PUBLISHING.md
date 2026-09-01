# PUBLISHING

How content becomes live, how it is compared before it does, how it is rolled
back, and how a menu becomes paper.

Referenced spec sections in brackets.

---

## The publishing spine

```
edit the draft → compare with live → publish → (roll back if wrong)
```

Four properties hold throughout, and each one exists because its absence has a
specific failure:

| Property | Why |
|---|---|
| **Atomic** `[§83]` | The version pointer moves inside the same transaction that writes the version. A visitor reads either the old menu or the new one, never a half-written mixture. |
| **Snapshotted** `[§84]` | A version stores the menu as it stood: categories, items, prices, availability, image references and the studio design row. Without content there is nothing to roll back *to*, which is the state this platform shipped in until recently. |
| **Append-only** `[§85]` | A rollback is itself a publish. It moves the menu forward to old content rather than deleting what came between, so a rollback can be rolled back and the trail never loses the fact that something was live. |
| **Permanent-URL-safe** `[§120, GOALS I2]` | Nothing in this flow touches the public id, the public URL or the QR. Publishing, rolling back and restoring a design all leave printed codes valid. |

### Comparing before publishing `[§10]`

`/admin/businesses/{id}/menus/{menuId}/versions` answers two questions on one
screen, because an operator asks them together:

- **What will publishing change?** Prices as `38.00 → 42.00 SAR`, items added
  and removed by name, everything else as from-and-to.
- **What did the last publish change, and can I go back?** Every version with
  its change counts, who published it, and a Restore control.

Items are matched by `itemCode`, never by name. Matching by name reports a
rename — the single most common edit — as a deletion plus an addition, which is
the two most alarming lines a summary can contain.

### Versions published before snapshots existed

They are shown, and reported as **not restorable**, rather than back-filled with
content that was never theirs. A history that quietly invents its own past is
worse than one with a gap in it.

---

## Menu scheduling `[§57]`

A menu can carry a **date window** (a season, Ramadan) and a **daily window**
(breakfast, a late menu). It is served only inside both.

Evaluated at read time from the stored values, never by a job flipping a flag —
the same choice offers make, for the same reason: a cron that fails leaves last
month's menu on a customer's phone, and nobody notices until a customer orders
from it.

- A closing time earlier than the opening one **runs past midnight**. `22:00`
  to `02:00` is an ordinary late menu.
- **Bad data fails open.** A malformed time or an unknown timezone serves the
  menu rather than hiding it. A business must never lose its menu to a typo.
- A menu with no window is always served, so every menu that predates
  scheduling behaves exactly as it did.

---

## The PDF path `[§59, §60, §62]`

The spec requires this path to be real and forbids exposing a fake button. It
offers three options — server-side generation, a stable uploaded PDF, or both —
and prefers both.

**Both are available. They are different things, and the difference is
deliberate.**

### 1. The official PDF, uploaded `[§61]`

A business uploads its own designed PDF through Files. It is versioned, only the
current version is public, and replacing it leaves the QR and the URL untouched.
This is the right answer whenever the business has a designed menu it wants
customers to see exactly as drawn.

### 2. The printable menu, generated from the live data

`/m/{publicId}/print` renders the current menu laid out for paper: no
photography, no navigation, prices in a column with leader dots, categories that
do not split across a page break, and the permanent address printed at the foot
so paper leads back to the live menu. The browser's own print dialog turns it
into a PDF.

**Why the browser rather than the server — this is the load-bearing decision.**

Writing a PDF directly means three separate problems, all of which fail
silently:

1. **Embedding an Arabic subset.** A PDF that assumes an Arabic face exists on
   the reader's machine renders as boxes on most of them.
2. **Bidirectional reordering.** Arabic runs right to left, prices and Latin
   names left to right, and the visual order is not the storage order.
3. **Shaping.** Every Arabic letter takes an initial, medial, final or isolated
   form depending on its neighbours. Unshaped Arabic is legible to nobody.

Each failure produces output that looks plausible to a developer who does not
read Arabic and is gibberish to the customer. A browser already solves all
three, with the same fonts the profile ships. Printing through it produces a
*typographically correct* Arabic PDF rather than a convincing-looking one.

**This is verified, not asserted.** `e2e/print-pdf.spec.ts` generates a real PDF
from the real page and checks that fonts are embedded (`/FontFile2`) and that
**every Arabic letter on the page is reachable from the PDF's ToUnicode maps** —
which is what makes the text selectable and readable to assistive technology,
and what is absent when shaping has gone wrong.

### What server-side generation would still require

Recorded so the decision stays a decision rather than a gap:

- **A headless browser in the runtime image.** Roughly 300 MB added to a
  container that is currently a Node runtime, plus its own patch cadence. This
  is a hosting cost and a security-surface decision for whoever operates the
  platform, not an implementation detail.
- **A queue.** Rendering a PDF inside a request ties up a worker for seconds. A
  hundred-item menu at print quality is not a request-path operation.
- **Storage and versioning for generated files**, so a generated PDF behaves
  like an uploaded one rather than being regenerated on every click.

None of it is difficult. All of it is a deployment decision, and the printable
page is a complete answer in the meantime rather than a placeholder.

### PDF QA `[§62]`

What the print path guarantees today, and how:

| Check | State |
|---|---|
| Fonts embedded | Verified in `e2e/print-pdf.spec.ts` |
| Arabic renders correctly | Verified — every letter Unicode-mapped |
| No clipped images | No images on the printable page, by construction |
| Page breaks | `break-inside: avoid-page` on categories, `avoid` on items |
| No orphan headings | `break-after: avoid` on category names |
| Print margins | `@page { size: A4; margin: 14mm }` |
| QR readability | The kit's symbols carry their own validation `[§122]` |

---

## The QR print kit `[§123, §124]`

`/admin/businesses/{id}/qr/kit` produces a zip: table card, counter card, window
sticker, A5 and A4 posters, a social image, the bare symbol as SVG and PNG, and
a README.

- Pieces are **SVG at real millimetre dimensions**, so a print shop receives
  files already at their finished size.
- The symbol is rendered **once** and re-placed into each layout, so every piece
  provably encodes the same destination.
- Brand colours are used when they pass the readability check, and fall back to
  black on white when they do not — with the README saying which happened. A
  code that does not scan is not a brand asset, and this goes to a printer,
  where the mistake becomes a thousand cards.
